"""
Model backends. Each one owns a single capability and knows how to say "I can't".

Design notes that matter:

* Everything loads lazily. Booting must not require 3 GB of RAM for models the
  user may never touch. First request for a language pays the load cost (~0.4 s
  for a Piper voice); after that it's cached.

* Voices are evicted LRU. A hub with 2 GB cannot hold every voice at once, and
  silently OOM-killing the whole service because someone tried a seventh
  language is exactly the failure mode we're trying to avoid.

* No backend raises raw library exceptions outward. They raise BackendError,
  which the pipeline can catch and fall back on.
"""

from __future__ import annotations

import base64
import io
import logging
import threading
import wave
from collections import OrderedDict
from pathlib import Path

import requests

log = logging.getLogger("drishti.backends")


class BackendError(RuntimeError):
    """A backend could not fulfil a request. Always safe to fall back on."""


# ---------------------------------------------------------------------------
# Text to speech — Piper, all voices in one process
# ---------------------------------------------------------------------------

class PiperTts:
    """
    Local neural speech. Holds several voices in one process.

    The earlier version of this system ran one HTTP server per voice on its own
    port, because Piper's bundled CLI server loads exactly one model. That was a
    limitation of the CLI, not the library — PiperVoice.load() returns an
    instance, so a dict of them works fine. Five processes became this class.
    """

    def __init__(self, voices_dir: str, max_loaded: int = 3):
        self.voices_dir = Path(voices_dir)
        self.max_loaded = max_loaded
        self._loaded: OrderedDict[str, object] = OrderedDict()
        self._lock = threading.Lock()
        self._piper = None

    def available(self) -> bool:
        try:
            self._import()
            return self.voices_dir.is_dir()
        except BackendError:
            return False

    def _import(self):
        if self._piper is None:
            try:
                from piper import PiperVoice
            except ImportError as e:
                raise BackendError(f"piper-tts not installed: {e}") from e
            self._piper = PiperVoice
        return self._piper

    def has_voice(self, voice_file: str | None) -> bool:
        return bool(voice_file) and (self.voices_dir / voice_file).is_file()

    def _voice(self, voice_file: str):
        with self._lock:
            if voice_file in self._loaded:
                self._loaded.move_to_end(voice_file)
                return self._loaded[voice_file]

            path = self.voices_dir / voice_file
            if not path.is_file():
                raise BackendError(f"voice file missing: {path}")

            PiperVoice = self._import()
            log.info("loading voice %s", voice_file)
            try:
                voice = PiperVoice.load(path)
            except Exception as e:
                raise BackendError(f"could not load voice {voice_file}: {e}") from e

            self._loaded[voice_file] = voice
            while len(self._loaded) > self.max_loaded:
                evicted, _ = self._loaded.popitem(last=False)
                log.info("evicted voice %s (cache limit %d)", evicted, self.max_loaded)
            return voice

    def speak(self, text: str, voice_file: str) -> bytes:
        """Return WAV bytes."""
        voice = self._voice(voice_file)
        buf = io.BytesIO()
        try:
            with wave.open(buf, "wb") as wav:
                voice.synthesize_wav(text, wav)
        except Exception as e:
            raise BackendError(f"synthesis failed: {e}") from e
        return buf.getvalue()


# ---------------------------------------------------------------------------
# Speech to text — faster-whisper
# ---------------------------------------------------------------------------

class WhisperAsr:
    def __init__(self, model_size: str = "small", compute_type: str = "int8"):
        self.model_size = model_size
        self.compute_type = compute_type
        self._model = None
        self._lock = threading.Lock()

    def available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as e:
                    raise BackendError(f"faster-whisper not installed: {e}") from e
                log.info("loading whisper '%s'", self.model_size)
                try:
                    self._model = WhisperModel(
                        self.model_size, device="cpu", compute_type=self.compute_type
                    )
                except Exception as e:
                    raise BackendError(f"could not load whisper: {e}") from e
            return self._model

    def listen(self, audio_path: str, lang_hint: str | None = None) -> tuple[str, str, float]:
        """Return (text, detected_language, confidence)."""
        model = self._load()
        try:
            segments, info = model.transcribe(
                audio_path, beam_size=5, language=lang_hint or None
            )
            text = "".join(s.text for s in segments).strip()
        except Exception as e:
            raise BackendError(f"transcription failed: {e}") from e
        return text, info.language, float(info.language_probability)


# ---------------------------------------------------------------------------
# Translation — NLLB-200
# ---------------------------------------------------------------------------

class NllbTranslator:
    def __init__(self, model_name: str = "facebook/nllb-200-distilled-600M"):
        self.model_name = model_name
        self._tok = None
        self._model = None
        self._lock = threading.Lock()

    def available(self) -> bool:
        try:
            import transformers  # noqa: F401
            return True
        except ImportError:
            return False

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
                except ImportError as e:
                    raise BackendError(f"transformers not installed: {e}") from e
                log.info("loading %s", self.model_name)
                try:
                    self._tok = AutoTokenizer.from_pretrained(self.model_name)
                    self._model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)
                except Exception as e:
                    raise BackendError(f"could not load translator: {e}") from e
            return self._tok, self._model

    def translate(self, text: str, src: str, tgt: str) -> str:
        if src == tgt:
            return text
        tok, model = self._load()
        try:
            tok.src_lang = src
            inputs = tok(text, return_tensors="pt")
            bos = tok.convert_tokens_to_ids(tgt)
            out = model.generate(**inputs, forced_bos_token_id=bos, max_length=400)
            return tok.batch_decode(out, skip_special_tokens=True)[0]
        except Exception as e:
            raise BackendError(f"translation failed: {e}") from e


# ---------------------------------------------------------------------------
# Cloud fallback — Bhashini (Government of India, free)
# ---------------------------------------------------------------------------

class Bhashini:
    """
    Used only where local models are missing or measurably unreliable:
    Tamil/Punjabi speech output, and recognition for every Indic language
    except Hindi.

    Unverified: this needs credentials we do not have, so the request shape
    below follows Bhashini's documented ULCA pattern but has never been run
    against the live service. available() returns False without credentials,
    so the system degrades honestly rather than pretending.
    """

    CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
    DEFAULT_PIPELINE = "64392f96daac500b55c543cd"

    def __init__(self, user_id: str = "", api_key: str = "", timeout: int = 20):
        self.user_id = user_id
        self.api_key = api_key
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.user_id and self.api_key)

    def _pipeline(self, task: str, src: str, tgt: str | None = None) -> dict:
        if not self.available():
            raise BackendError("bhashini credentials not configured")
        cfg = {"language": {"sourceLanguage": src}}
        if tgt:
            cfg["language"]["targetLanguage"] = tgt
        try:
            r = requests.post(
                self.CONFIG_URL,
                json={
                    "pipelineTasks": [{"taskType": task, "config": cfg}],
                    "pipelineRequestConfig": {"pipelineId": self.DEFAULT_PIPELINE},
                },
                headers={"userID": self.user_id, "ulcaApiKey": self.api_key},
                timeout=self.timeout,
            )
            r.raise_for_status()
            d = r.json()
            ep = d["pipelineInferenceAPIEndPoint"]
            return {
                "url": ep["callbackUrl"],
                "header": ep["inferenceApiKey"]["name"],
                "value": ep["inferenceApiKey"]["value"],
                "service": d["pipelineResponseConfig"][0]["config"][0]["serviceId"],
            }
        except Exception as e:
            raise BackendError(f"bhashini pipeline config failed: {e}") from e

    def speak(self, text: str, lang: str) -> bytes:
        p = self._pipeline("tts", lang)
        try:
            r = requests.post(
                p["url"],
                json={
                    "pipelineTasks": [{
                        "taskType": "tts",
                        "config": {
                            "language": {"sourceLanguage": lang},
                            "serviceId": p["service"],
                            "gender": "female",
                        },
                    }],
                    "inputData": {"input": [{"source": text}]},
                },
                headers={p["header"]: p["value"]},
                timeout=self.timeout,
            )
            r.raise_for_status()
            b64 = r.json()["pipelineResponse"][0]["audio"][0]["audioContent"]
            return base64.b64decode(b64)
        except Exception as e:
            raise BackendError(f"bhashini tts failed: {e}") from e

    def listen(self, audio_bytes: bytes, lang: str) -> str:
        p = self._pipeline("asr", lang)
        try:
            r = requests.post(
                p["url"],
                json={
                    "pipelineTasks": [{
                        "taskType": "asr",
                        "config": {
                            "language": {"sourceLanguage": lang},
                            "serviceId": p["service"],
                            "audioFormat": "wav",
                        },
                    }],
                    "inputData": {
                        "audio": [{"audioContent": base64.b64encode(audio_bytes).decode()}]
                    },
                },
                headers={p["header"]: p["value"]},
                timeout=self.timeout,
            )
            r.raise_for_status()
            return r.json()["pipelineResponse"][0]["output"][0]["source"]
        except Exception as e:
            raise BackendError(f"bhashini asr failed: {e}") from e


# ---------------------------------------------------------------------------
# Answering — optional local LLM
# ---------------------------------------------------------------------------

class TesseractOcr:
    """
    Reads text out of a photo. Tesseract carries trained data for Devanagari,
    Bengali, Telugu, Tamil and Gurmukhi, which is why it is the default here
    rather than a heavier vision model — this has to run on a phone-class box.
    """

    LANG_DATA = {"en": "eng", "hi": "hin", "bn": "ben", "mr": "mar",
                 "te": "tel", "ta": "tam", "pa": "pan"}

    def available(self) -> bool:
        try:
            import pytesseract
            from PIL import Image  # noqa: F401
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False

    def read(self, image_bytes: bytes, lang_code: str) -> str:
        try:
            import pytesseract
            from PIL import Image
        except ImportError as e:
            raise BackendError(f"pytesseract/Pillow not installed: {e}") from e
        try:
            img = Image.open(io.BytesIO(image_bytes))
            data = self.LANG_DATA.get(lang_code, "eng")
            return pytesseract.image_to_string(img, lang=data).strip()
        except Exception as e:
            raise BackendError(f"OCR failed: {e}") from e


class LocalAnswerer:
    """
    Talks to an OpenAI-compatible local endpoint (llama.cpp server, Ollama).

    Deliberately kept small in scope. See SAFETY in ARCHITECTURE.md: a small
    quantised model is fine for general knowledge and useless-to-harmful for
    crop treatment, dosage, or legal questions. The system prompt below tells
    the model to decline rather than guess, and the pipeline refuses certain
    topics outright regardless of what the model would have said.
    """

    SYSTEM = (
        "You answer in one or two short, plain sentences. "
        "The person asking may not read well and is listening, not reading. "
        "Use simple words. No lists, no markdown, no preamble. "
        "If you are not sure, say you are not sure — never guess."
    )

    def __init__(self, url: str = "", model: str = "", timeout: int = 45):
        self.url = url
        self.model = model
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.url)

    def answer(self, question: str) -> str:
        if not self.available():
            raise BackendError("no answering model configured")
        try:
            r = requests.post(
                self.url,
                json={
                    "model": self.model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": self.SYSTEM},
                        {"role": "user", "content": question},
                    ],
                },
                timeout=self.timeout,
            )
            r.raise_for_status()
            d = r.json()
            # Ollama shape, then OpenAI shape
            if "message" in d:
                return d["message"]["content"].strip()
            return d["choices"][0]["message"]["content"].strip()
        except Exception as e:
            raise BackendError(f"answering failed: {e}") from e
