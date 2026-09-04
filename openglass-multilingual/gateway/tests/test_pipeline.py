"""
Tests for routing policy, using fake backends.

These deliberately do not load any model. What is worth testing here is the
decision-making — does the pipeline route Telugu recognition away from Whisper,
does it refuse a pesticide dose question, does it report degraded honestly —
and that logic should be verifiable in milliseconds without 3 GB of weights.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from drishti import languages as L
from drishti.pipeline import Pipeline, Unsupported, high_stakes_topic


class FakeTts:
    def __init__(self, ok=True, voices=("hi", "te", "en", "bn", "mr")):
        self.ok, self.voices, self.calls = ok, voices, []

    def available(self): return self.ok
    def has_voice(self, vf): return bool(vf) and any(v in (vf or "") for v in self.voices)
    def speak(self, text, vf): self.calls.append((text, vf)); return b"RIFFlocal"


class FakeAsr:
    def __init__(self, ok=True, text="सवाल"): self.ok, self.text, self.calls = ok, text, []
    def available(self): return self.ok
    def listen(self, path, hint=None): self.calls.append(hint); return self.text, hint or "hi", 0.99


class FakeMt:
    def __init__(self, ok=True): self.ok, self.calls = ok, []
    def available(self): return self.ok
    def translate(self, text, s, t): self.calls.append((s, t)); return f"[{t}]{text}"


class FakeCloud:
    def __init__(self, ok=False): self.ok, self.spoke, self.heard = ok, [], []
    def available(self): return self.ok
    def speak(self, text, lang): self.spoke.append(lang); return b"RIFFcloud"
    def listen(self, audio, lang): self.heard.append(lang); return "cloud heard"


class FakeAnswerer:
    def __init__(self, ok=True, reply="It will rain."): self.ok, self.reply = ok, reply
    def available(self): return self.ok
    def answer(self, q): return self.reply


def build(**kw):
    return Pipeline(
        tts=kw.get("tts", FakeTts()), asr=kw.get("asr", FakeAsr()),
        mt=kw.get("mt", FakeMt()), cloud=kw.get("cloud", FakeCloud()),
        answerer=kw.get("answerer", FakeAnswerer()), ocr=kw.get("ocr"),
    )


# -- the safety guard --------------------------------------------------------

@pytest.mark.parametrize("q,topic", [
    ("how much urea per acre should I spray", "agriculture"),
    ("what dosage of paracetamol for a child", "health"),
    ("can I get bail for this case", "legal"),
    ("when is the next bus to the market", None),
    ("what is the capital of Karnataka", None),
])
def test_high_stakes_detection(q, topic):
    assert high_stakes_topic(q) == topic


def test_ask_refuses_dosage_instead_of_guessing():
    answerer = FakeAnswerer(reply="Take 500mg twice daily")  # must NOT reach the user
    pipe = build(answerer=answerer)
    r = pipe.ask(None, "what dosage of paracetamol for a child", "en")
    assert r.data["refused_topic"] == "health"
    assert "doctor" in r.data["answer"].lower()
    assert "500mg" not in r.data["answer"]


# -- routing around measured-bad local recognition ---------------------------

def test_telugu_listening_prefers_cloud_because_whisper_is_wrong_for_it():
    assert L.needs_cloud_for_listening(L.get("te")) is True
    cloud, asr = FakeCloud(ok=True), FakeAsr()
    pipe = build(cloud=cloud, asr=asr)
    r = pipe.listen(b"audio", "te")
    assert r.via == "bhashini" and r.degraded is True
    assert cloud.heard == ["te"]
    assert asr.calls == []          # local recogniser never consulted


def test_hindi_listening_stays_local():
    assert L.needs_cloud_for_listening(L.get("hi")) is False
    cloud = FakeCloud(ok=True)
    pipe = build(cloud=cloud)
    r = pipe.listen(b"audio", "hi")
    assert r.via == "whisper" and r.degraded is False
    assert cloud.heard == []        # nothing left the device


def test_bad_local_asr_used_only_when_no_cloud_and_flagged_unreliable():
    pipe = build(cloud=FakeCloud(ok=False))
    r = pipe.listen(b"audio", "mr")
    assert r.via == "whisper"
    assert r.degraded is True and r.data["unreliable"] is True


# -- speech output fallbacks --------------------------------------------------

def test_tamil_speech_falls_back_to_cloud_since_piper_has_no_voice():
    assert L.get("ta").tts_voice is None
    cloud = FakeCloud(ok=True)
    pipe = build(cloud=cloud)
    r = pipe.speak("வணக்கம்", "ta")
    assert r.via == "bhashini" and r.degraded is True and cloud.spoke == ["ta"]


def test_tamil_speech_fails_clearly_with_no_cloud():
    pipe = build(cloud=FakeCloud(ok=False))
    with pytest.raises(Unsupported) as e:
        pipe.speak("வணக்கம்", "ta")
    assert "Tamil" in str(e.value)
    assert e.value.remedy                       # tells the operator how to fix it


def test_hindi_speech_stays_local_and_not_degraded():
    r = build().speak("नमस्ते", "hi")
    assert r.via == "piper" and r.degraded is False


# -- the ask loop -------------------------------------------------------------

def test_ask_pivots_through_english_and_returns_native_plus_audio():
    mt = FakeMt()
    pipe = build(mt=mt)
    r = pipe.ask(None, "kal barish hogi kya", "hi")
    assert mt.calls == [("hin_Deva", "eng_Latn"), ("eng_Latn", "hin_Deva")]
    assert r.data["answer"].startswith("[hin_Deva]")
    assert r.data["audio"] == b"RIFFlocal"
    assert r.data["refused_topic"] is None


def test_ask_without_answering_model_says_so_with_a_remedy():
    pipe = build(answerer=FakeAnswerer(ok=False))
    with pytest.raises(Unsupported) as e:
        pipe.ask(None, "hello", "en")
    assert "config.toml" in e.value.remedy


def test_english_ask_skips_translation_entirely():
    mt = FakeMt()
    build(mt=mt).ask(None, "what time is it", "en")
    assert mt.calls == []


# -- understand ---------------------------------------------------------------

def test_understand_translates_between_two_people():
    pipe = build(asr=FakeAsr(text="where is the hospital"))
    r = pipe.understand(b"audio", "en", "hi")
    assert r.data["heard"] == "where is the hospital"
    assert r.data["text"] == "[hin_Deva]where is the hospital"
    assert r.data["audio"] == b"RIFFlocal"


# -- honest capability reporting ---------------------------------------------

def test_capabilities_admit_what_is_missing():
    caps = build(cloud=FakeCloud(ok=False)).capabilities()
    ta = caps["languages"]["ta"]
    assert ta["speak"]["available"] is False        # no voice, no cloud
    assert ta["listen"]["local_quality"] == "poor"

    hi = caps["languages"]["hi"]
    assert hi["speak"]["local"] is True and hi["listen"]["local"] is True

    assert caps["backends"]["ocr"] is False         # no OCR backend passed


def test_capabilities_flag_network_need_when_cloud_covers_the_gap():
    caps = build(cloud=FakeCloud(ok=True)).capabilities()
    ta = caps["languages"]["ta"]
    assert ta["speak"]["available"] is True
    assert ta["speak"]["needs_network"] is True     # user can be told before they tap


def test_unknown_language_is_rejected():
    with pytest.raises(Unsupported):
        build().speak("hello", "xx")


# -- read ---------------------------------------------------------------------

def test_read_is_unavailable_without_ocr_and_says_how_to_fix():
    with pytest.raises(Unsupported) as e:
        build().read(b"img", "en", "hi")
    assert "tesseract" in e.value.remedy.lower()


def test_read_translates_a_photographed_form():
    class FakeOcr:
        def available(self): return True
        def read(self, b, lang): return "Application for ration card"
    r = build(ocr=FakeOcr()).read(b"img", "en", "hi")
    assert r.data["found"] == "Application for ration card"
    assert r.data["text"] == "[hin_Deva]Application for ration card"
