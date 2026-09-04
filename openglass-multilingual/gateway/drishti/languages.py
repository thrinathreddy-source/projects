"""
The single source of truth for what this system can actually do, per language.

Every quality rating below came from a closed-loop test: synthesise a sentence
with Piper, feed that audio back into the recogniser, compare. Nothing here is
aspirational. If a rating says POOR, we measured it being poor.

The point of tracking quality explicitly — rather than just "backend configured
yes/no" — is that a wrong answer delivered confidently is worse than no answer.
A farm worker acting on a mistranscribed question can lose a crop. The pipeline
reads these ratings and refuses to serve a POOR path when a better one exists,
and tells the caller plainly when none does.
"""

from dataclasses import dataclass, field
from enum import Enum


class Quality(str, Enum):
    GOOD = "good"      # verified working, safe to use as primary
    POOR = "poor"      # measurably unreliable — only if nothing better exists, and flagged
    NONE = "none"      # not available at all through this backend


@dataclass(frozen=True)
class Language:
    code: str            # BCP-47-ish short code used across our API
    english_name: str
    native_name: str
    script: str

    # Local, self-hosted capability
    tts_voice: str | None = None        # Piper .onnx filename, None = no voice exists
    asr_quality: Quality = Quality.NONE
    mt_code: str | None = None          # FLORES-200 code for NLLB

    # Cloud fallback (Bhashini) language code, when local is missing or poor
    bhashini_code: str | None = None

    notes: str = ""


# ---------------------------------------------------------------------------
# ASR quality below is from testing faster-whisper (small AND medium) against
# Piper-generated speech in each language. Hindi was the only Indic language
# that came back reliably. Bengali/Marathi/Telugu transcribed into Devanagari
# regardless of the language actually spoken — a decoder bias in Whisper, not a
# model-size problem (medium made language *detection* better and transcription
# no better). The fix is AI4Bharat IndicConformerASR, not a bigger Whisper.
# ---------------------------------------------------------------------------

LANGUAGES: dict[str, Language] = {
    "en": Language(
        code="en", english_name="English", native_name="English", script="Latin",
        tts_voice="en_US-lessac-medium.onnx", asr_quality=Quality.GOOD,
        mt_code="eng_Latn", bhashini_code="en",
    ),
    "hi": Language(
        code="hi", english_name="Hindi", native_name="हिन्दी", script="Devanagari",
        tts_voice="hi_IN-pratham-medium.onnx", asr_quality=Quality.GOOD,
        mt_code="hin_Deva", bhashini_code="hi",
        notes="Only Indic language with reliable local speech recognition.",
    ),
    "bn": Language(
        code="bn", english_name="Bengali", native_name="বাংলা", script="Bengali",
        tts_voice="bn_BD-google-medium.onnx", asr_quality=Quality.POOR,
        mt_code="ben_Beng", bhashini_code="bn",
        notes="Whisper transcribes Bengali speech into Devanagari. Routed to cloud ASR.",
    ),
    "mr": Language(
        code="mr", english_name="Marathi", native_name="मराठी", script="Devanagari",
        tts_voice="mr_IN-google-medium.onnx", asr_quality=Quality.POOR,
        mt_code="mar_Deva", bhashini_code="mr",
        notes="Whisper often misidentifies Marathi as Hindi. Routed to cloud ASR.",
    ),
    "te": Language(
        code="te", english_name="Telugu", native_name="తెలుగు", script="Telugu",
        tts_voice="te_IN-venkatesh-medium.onnx", asr_quality=Quality.POOR,
        mt_code="tel_Telu", bhashini_code="te",
        notes="Whisper misidentified Telugu as Malayalam. Routed to cloud ASR.",
    ),
    "ta": Language(
        code="ta", english_name="Tamil", native_name="தமிழ்", script="Tamil",
        tts_voice=None, asr_quality=Quality.POOR,
        mt_code="tam_Taml", bhashini_code="ta",
        notes="Piper has no Tamil voice at all. Speech output requires cloud.",
    ),
    "pa": Language(
        code="pa", english_name="Punjabi", native_name="ਪੰਜਾਬੀ", script="Gurmukhi",
        tts_voice=None, asr_quality=Quality.POOR,
        mt_code="pan_Guru", bhashini_code="pa",
        notes="Piper has no Punjabi voice at all. Speech output requires cloud.",
    ),
}


def get(code: str) -> Language | None:
    return LANGUAGES.get(code)


def supported_codes() -> list[str]:
    return list(LANGUAGES.keys())


def needs_cloud_for_speech(lang: Language) -> bool:
    """True when we cannot produce speech locally for this language."""
    return lang.tts_voice is None


def needs_cloud_for_listening(lang: Language) -> bool:
    """True when local recognition is measurably unreliable for this language."""
    return lang.asr_quality is not Quality.GOOD
