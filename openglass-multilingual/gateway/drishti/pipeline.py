"""
The pipeline: three things a person can actually do, composed from primitives.

Routing policy lives here, in one place, and it is driven by the measured
quality table in languages.py rather than by whatever backend happens to be
configured. The rule is simple and applies everywhere:

    prefer local  ->  fall back to cloud  ->  fail loudly, never silently

Every result carries `via` (which backend served it) and `degraded` (whether we
had to leave the preferred path). The app surfaces that to the user. A person
deserves to know when their words went to a server instead of staying on the
device — that is a privacy fact, not an implementation detail.
"""

from __future__ import annotations

import logging
import os
import tempfile
from dataclasses import dataclass, field

from . import languages as L
from .backends import BackendError

log = logging.getLogger("drishti.pipeline")


# ---------------------------------------------------------------------------

@dataclass
class Result:
    ok: bool
    via: str = ""                    # which backend actually served this
    degraded: bool = False           # we left the preferred (local) path
    error: str = ""                  # user-safe message, already translated
    data: dict = field(default_factory=dict)


class Unsupported(Exception):
    """
    We cannot do this at all, and we know why.

    `code` is the important field: the app localises on that, so a Telugu
    speaker gets a Telugu sentence rather than our English one. `message` is
    the developer-facing fallback, `remedy` is for whoever set the box up.
    """

    def __init__(self, message: str, remedy: str = "", code: str = "unavailable"):
        super().__init__(message)
        self.message = message
        self.remedy = remedy
        self.code = code


# High-stakes topics where a small quantised model's guess can cause real harm.
# This is a blunt instrument on the English pivot text and it will miss things —
# it is a floor, not a guarantee. The honest fix is routing these to real
# authorities (a doctor, the district agriculture officer, a legal aid line),
# which is a product/partnership problem, not something a filter solves.
HIGH_STAKES = {
    "health": ["dose", "dosage", "mg ", "tablet", "medicine", "symptom", "poison",
               "pregnan", "overdose", "injection", "vaccine", "chest pain", "bleeding"],
    "agriculture": ["pesticide", "insecticide", "herbicide", "fungicide", "spray",
                    "fertiliser", "fertilizer", "urea", "how much per acre"],
    "legal": ["lawsuit", "arrest", "court case", "fir ", "bail", "legal notice"],
}

REFUSALS = {
    "health": "I am not able to give medical advice. Please ask a doctor or a health worker.",
    "agriculture": "I am not able to advise on chemicals or doses. Please ask your local agriculture officer.",
    "legal": "I am not able to give legal advice. Please speak to a legal aid service.",
}


def high_stakes_topic(english_text: str) -> str | None:
    low = english_text.lower()
    for topic, markers in HIGH_STAKES.items():
        if any(m in low for m in markers):
            return topic
    return None


# ---------------------------------------------------------------------------

class Pipeline:
    def __init__(self, tts, asr, mt, cloud, answerer, ocr=None, renderer=None):
        self.tts = tts
        self.asr = asr
        self.mt = mt
        self.cloud = cloud
        self.answerer = answerer
        self.ocr = ocr
        self.renderer = renderer

    # -- the display ----------------------------------------------------------

    def to_display(self, text: str, lang: str, page: int = 0) -> dict | None:
        """
        Render text for the glasses.

        Returned alongside every answer so the caller can push it straight to
        the panel — and, while no display hardware exists, so the app can show
        the wearer's-eye preview instead of guessing what would appear.

        Returns None rather than raising: a missing font should cost you the
        display, not the answer you already have in your ear.
        """
        if not self.renderer:
            return None
        try:
            from .display import encode_frame

            frame = self.renderer.render(text, lang, page=page)
            packets = encode_frame(frame)
            return {
                "page": frame.page,
                "pages": frame.pages,
                "width": frame.panel.width,
                "height": frame.panel.height,
                "lit_pixels": frame.lit(),
                "raw_bytes": len(frame.packed()),
                "wire_bytes": len(frame.rle()),
                "packets": len(packets),
                "frame": frame,
            }
        except Exception as e:
            log.warning("display render failed for %s: %s", lang, e)
            return None

    # -- capability reporting -------------------------------------------------

    def capabilities(self) -> dict:
        """
        What this box can actually do right now — not what it was configured to
        do. Used by /v1/health and /v1/languages, and by the app to hide
        features rather than let a person tap something that will fail.
        """
        local_tts = self.tts.available()
        local_asr = self.asr.available()
        local_mt = self.mt.available()
        cloud_ok = self.cloud.available()

        langs = {}
        for code, lang in L.LANGUAGES.items():
            can_speak_local = local_tts and self.tts.has_voice(lang.tts_voice)
            can_speak_cloud = cloud_ok and bool(lang.bhashini_code)
            listen_local_good = local_asr and lang.asr_quality is L.Quality.GOOD
            can_listen_cloud = cloud_ok and bool(lang.bhashini_code)

            langs[code] = {
                "code": code,
                "english_name": lang.english_name,
                "native_name": lang.native_name,
                "script": lang.script,
                "speak": {
                    "available": can_speak_local or can_speak_cloud,
                    "local": can_speak_local,
                    "needs_network": (not can_speak_local) and can_speak_cloud,
                },
                "listen": {
                    "available": listen_local_good or can_listen_cloud,
                    "local": listen_local_good,
                    "needs_network": (not listen_local_good) and can_listen_cloud,
                    "local_quality": lang.asr_quality.value,
                },
                "translate": {"available": local_mt and bool(lang.mt_code), "local": local_mt},
                "notes": lang.notes,
            }

        return {
            "backends": {
                "tts_local": local_tts,
                "asr_local": local_asr,
                "translate_local": local_mt,
                "cloud_fallback": cloud_ok,
                "answering": self.answerer.available(),
                "ocr": bool(self.ocr and self.ocr.available()),
            },
            "languages": langs,
        }

    # -- primitives -----------------------------------------------------------

    def speak(self, text: str, code: str) -> Result:
        lang = L.get(code)
        if not lang:
            raise Unsupported(f"unknown language '{code}'", code="unknown_language")

        if self.tts.available() and self.tts.has_voice(lang.tts_voice):
            try:
                return Result(True, via="piper", data={"audio": self.tts.speak(text, lang.tts_voice)})
            except BackendError as e:
                log.warning("piper failed for %s, trying cloud: %s", code, e)

        if self.cloud.available() and lang.bhashini_code:
            try:
                audio = self.cloud.speak(text, lang.bhashini_code)
                return Result(True, via="bhashini", degraded=True, data={"audio": audio})
            except BackendError as e:
                log.warning("cloud tts failed for %s: %s", code, e)

        raise Unsupported(
            f"no speech voice available for {lang.english_name}",
            remedy=("Piper has no voice for this language; add Bhashini credentials "
                    "to enable cloud speech." if lang.tts_voice is None else
                    "Voice file missing from the voices directory."),
            code="no_voice",
        )

    def listen(self, audio_bytes: bytes, code: str | None) -> Result:
        """
        Speech to text. Routes around Whisper for languages where we measured it
        producing the wrong script — see languages.py.
        """
        lang = L.get(code) if code else None

        if lang and L.needs_cloud_for_listening(lang):
            if self.cloud.available() and lang.bhashini_code:
                try:
                    text = self.cloud.listen(audio_bytes, lang.bhashini_code)
                    return Result(True, via="bhashini", degraded=True,
                                  data={"text": text, "language": code})
                except BackendError as e:
                    log.warning("cloud asr failed for %s: %s", code, e)
            # Deliberately do NOT silently fall through to a recogniser we
            # measured as broken for this language. Say so instead.
            if not self.asr.available():
                raise Unsupported(f"cannot listen in {lang.english_name}", code="cannot_listen")
            log.warning("using known-unreliable local ASR for %s", code)

        if not self.asr.available():
            raise Unsupported("speech recognition is not installed", code="cannot_listen")

        tmp = tempfile.NamedTemporaryFile(suffix=".audio", delete=False)
        try:
            tmp.write(audio_bytes)
            tmp.close()
            text, detected, conf = self.asr.listen(tmp.name, code)
        finally:
            os.unlink(tmp.name)

        unreliable = bool(lang and lang.asr_quality is not L.Quality.GOOD)
        return Result(
            True, via="whisper", degraded=unreliable,
            data={"text": text, "language": detected, "confidence": conf,
                  "unreliable": unreliable},
        )

    def translate(self, text: str, src: str, tgt: str) -> Result:
        s, t = L.get(src), L.get(tgt)
        if not s or not t:
            raise Unsupported(f"unknown language pair {src}->{tgt}", code="unknown_language")
        if src == tgt:
            return Result(True, via="none", data={"text": text})
        if not (self.mt.available() and s.mt_code and t.mt_code):
            raise Unsupported("translation is not installed", code="no_translation")
        return Result(True, via="nllb",
                      data={"text": self.mt.translate(text, s.mt_code, t.mt_code)})

    # -- the three things a person can do -------------------------------------

    def ask(self, audio_bytes: bytes | None, text: str | None, code: str) -> Result:
        """
        ASK — say a question in your language, get a short spoken answer back.

        Internally: your speech -> your text -> English -> answer -> your
        language -> speech. English is a pivot because that is what the small
        answering models are actually good at; the person never sees it.
        """
        lang = L.get(code)
        if not lang:
            raise Unsupported(f"unknown language '{code}'")

        degraded, route = False, []

        if text is None:
            heard = self.listen(audio_bytes, code)
            text = heard.data["text"]
            degraded |= heard.degraded
            route.append(heard.via)
        if not text.strip():
            raise Unsupported("I did not catch that.", code="didnt_catch")

        question_en = text
        if code != "en":
            tr = self.translate(text, code, "en")
            question_en = tr.data["text"]
            route.append(tr.via)

        topic = high_stakes_topic(question_en)
        if topic:
            answer_en = REFUSALS[topic]
            route.append("refused:" + topic)
        elif self.answerer.available():
            answer_en = self.answerer.answer(question_en)
            route.append("llm")
        else:
            raise Unsupported(
                "no answering model is configured",
                remedy="Set [answer] url in config.toml (llama.cpp or Ollama).",
                code="no_answer_model",
            )

        answer_native = answer_en
        if code != "en":
            tr = self.translate(answer_en, "en", code)
            answer_native = tr.data["text"]

        spoken = self.speak(answer_native, code)
        degraded |= spoken.degraded

        return Result(
            True, via="+".join(route), degraded=degraded,
            data={"question": text, "answer": answer_native,
                  "audio": spoken.data["audio"], "refused_topic": topic,
                  "display": self.to_display(answer_native, code)},
        )

    def understand(self, audio_bytes: bytes, src: str, tgt: str) -> Result:
        """
        UNDERSTAND — someone speaks a language you don't. You see and hear it in
        yours. No question, no answer, no model opinion: just their words.
        """
        heard = self.listen(audio_bytes, src)
        said = heard.data["text"]
        if not said.strip():
            raise Unsupported("I did not catch that.")

        tr = self.translate(said, src, tgt)
        out = tr.data["text"]
        spoken = self.speak(out, tgt)

        return Result(
            True, via=f"{heard.via}+{tr.via}+{spoken.via}",
            degraded=heard.degraded or spoken.degraded,
            data={"heard": said, "text": out, "audio": spoken.data["audio"],
                  "display": self.to_display(out, tgt)},
        )

    def read(self, image_bytes: bytes, image_lang: str, code: str) -> Result:
        """
        READ — point a camera at text you cannot read. Hear it in your language.

        PARKED. The code works and the tests cover it, but this is not being
        developed while the in-lens display is the focus. It needs no camera on
        the glasses (the phone's is enough), so parking it costs the hardware
        design nothing and it can come back whenever.
        """
        if not (self.ocr and self.ocr.available()):
            raise Unsupported(
                "reading text from images is not installed",
                remedy="Install tesseract plus the language data (see ARCHITECTURE.md).",
                code="no_ocr",
            )
        found = self.ocr.read(image_bytes, image_lang)
        if not found.strip():
            raise Unsupported("I could not find any text in that picture.", code="no_text_found")

        out, route = found, ["ocr"]
        if image_lang != code:
            tr = self.translate(found, image_lang, code)
            out = tr.data["text"]
            route.append(tr.via)

        spoken = self.speak(out, code)
        return Result(True, via="+".join(route + [spoken.via]), degraded=spoken.degraded,
                      data={"found": found, "text": out, "audio": spoken.data["audio"]})
