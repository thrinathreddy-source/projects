# How the software works, and what it actually does

Written for someone deciding whether to build on this. Everything here was run
and measured, not sketched. Where something does not work, it says so.

---

## 1. What a person can do

Three things. Not eight. Each one exists because it solves a problem someone has
on a real day, and each one had to earn its place against "does a person who
cannot read English actually need this?"

### ASK — say a question, hear an answer

Press the button, speak in your language, get a short spoken answer back.

*"Will it rain tomorrow?" · "When does the bank open?" · "What does this word mean?"*

**Needs:** microphone, an answering model configured.
**Works offline:** yes, if the answering model runs locally.

### UNDERSTAND — they speak theirs, you get yours

Someone speaks a language you do not. You see and hear what they said, in your
language. No question, no opinion from a model — just their words moved across.

*A migrant worker and a foreman. A patient and a doctor from another state.*

**Needs:** microphone.
**Works offline:** yes, for Hindi and English. Others need the network (see §4).

### READ — point at writing you cannot read *(parked)*

Point a phone camera at a form or a medicine label, hear it in your language.

**Parked while the in-lens display is the focus.** The code works and the tests
cover it; it is simply not being developed. It needs no camera on the glasses —
the phone's is enough — so parking it costs the hardware design nothing and it
can come back whenever.

### What we deliberately do not do

No accounts. No cloud sync. No history you have to manage. No notifications. No
feed. No settings screen beyond choosing your language. The interface is one
button and two words, because every extra control is a thing that has to be
explained to someone who was never given a reason to trust software.

---

## 2. The shape of it

```
    ┌──────────────────────┐
    │  GLASSES             │   640x200 mono waveguide
    │  ESP32-S3, BLE       │   + microphone, no camera
    └──────────┬───────────┘
               │  Bluetooth LE
    ┌──────────▼───────────┐
    │  COMPANION APP       │   3 source files
    │  phone or browser    │   records audio, shows + speaks the answer
    └──────────┬───────────┘
               │  HTTP, one address, one contract
    ┌──────────▼───────────────────────────────────┐
    │  DRISHTI GATEWAY            one process      │
    │                                              │
    │   /v1/ask  /v1/understand  /v1/display       │
    │   /v1/speak /v1/listen /v1/translate         │
    │   /v1/health /v1/languages                   │
    │                                              │
    │   ├─ HarfBuzz    shaping  ─┐                 │
    │   ├─ FreeType    raster   ─┴─> 1-bit frame   │
    │   ├─ Piper       speech out, all voices      │
    │   ├─ Whisper     speech in                   │
    │   ├─ NLLB-200    translation, 200 languages  │
    │   ├─ LLM         answering (optional)        │
    │   ├─ Bhashini    cloud fallback (optional)   │
    │   └─ Tesseract   reading photos  (parked)    │
    └──────────────────────────────────────────────┘
```

**One process.** This used to be seven — five Piper servers on five ports, plus
translation, plus recognition. That was not a design, it was an accident: Piper's
bundled CLI server loads exactly one voice, so five voices looked like it needed
five servers. It does not. `PiperVoice.load()` returns an object; a dictionary of
them works fine. Verified: three voices in one process, 0.4–0.6 s to load each,
0.4–0.6 s to speak a sentence.

Seven things that could each die silently became one thing with a health check.

---

## 3. What happens when someone asks a question

A farm worker holds the button and says, in Telugu, *"రేపు వర్షం పడుతుందా?"*

| # | Step | Where | Notes |
|---|------|-------|-------|
| 1 | Audio captured | phone | ~2 s of WebM |
| 2 | `POST /v1/ask` | → gateway | one request, audio + `lang=te` |
| 3 | Speech → text | **cloud** | Telugu is routed away from local Whisper — §4 |
| 4 | Telugu → English | local | NLLB-200 |
| 5 | Safety check | local | high-stakes topics refused before any model runs |
| 6 | English answer | local LLM | one or two plain sentences |
| 7 | English → Telugu | local | NLLB-200 |
| 8 | Text → speech | local | Piper `te_IN-venkatesh` |
| 9 | One response back | ← gateway | text **and** audio together |

English in the middle is a pivot, not a preference: small models reason better in
English, and the person never sees it. Step 9 returns text and audio in a single
response on purpose — on a weak rural connection, two round trips is one too many.

**Measured, end to end, on a laptop:** Hindi speech in → *"मेरा नाम राम है"*
transcribed exactly → *"My name is Ram"* → spoken back. `via=whisper+nllb+piper`,
`degraded=false`.

---

## 3a. The display — what actually reaches the eye

This is the product. Everything above it exists to put one short line of text in
front of someone's eye in a script they read.

### The panel we target

| | |
|---|---|
| Resolution | 640 × 200 |
| Colour | monochrome green, **1 bit per pixel** |
| Refresh | ~20 Hz |
| Minimum legible text | ~26 px tall |

A waveguide pixel is lit or it is not. Anti-aliased grey is a lie that becomes
dither noise on the panel, so the renderer thresholds deliberately — and low
(96, not 128), because Devanagari's headline bar and Telugu's loops are thin and
a midpoint threshold eats them.

### The bug this nearly shipped with

Pillow on this machine has **no Raqm**, so it cannot shape complex scripts. We
rendered the six languages with plain text drawing and looked at the output:

- **Hindi looked fine.** That is the dangerous part — a casual check passes.
- **Telugu was broken:** `నమస్కారం` came out as base consonant, a floating
  virama, then a detached vowel. No conjunct formed.
- **Tamil was broken:** pulli marks detached and misplaced.

Nobody who cannot read Telugu would have caught this. It would have shipped as
glyph soup on a Telugu speaker's glasses.

The fix is real shaping: **HarfBuzz** produces the glyph sequence and positions,
**FreeType** rasterises each glyph, and we composite into the 1-bit buffer
ourselves. Verified fixed for all six scripts.

Two tests lock this down so it cannot regress quietly. Both are font-independent:
a shaped conjunct is *narrower* than its parts drawn separately, and `कि` must
not equal `ि` + `क` — the vowel is typed after its consonant and drawn before it,
so a renderer that merely concatenates in input order fails.

### Getting a frame to the glasses

A raw frame is 640 × 200 ÷ 8 = **16,000 bytes**. Over BLE at a realistic
10 KB/s that is ~1.6 s per screen — far too slow to feel like a heads-up
display.

Text on an unlit field is mostly long runs of zero bytes, so run-length encoding
is where the transport becomes viable. Measured, one line of real text:

| Language | Wire bytes | Compression | BLE packets |
|---|---|---|---|
| Punjabi | 1,144 | 14.0× | 7 |
| Hindi | 1,266 | 12.6× | 8 |
| English | 1,344 | 11.9× | 8 |
| Tamil | 1,520 | 10.5× | 9 |
| Bengali | 1,530 | 10.5× | 9 |
| Telugu | 2,340 | 6.8× | 13 |

Under 0.25 s per screen. Telugu is the worst case — denser glyphs, more lit
pixels, fewer long runs.

### Wire format (for whoever writes the firmware)

Each BLE notification is a 6-byte header plus up to 180 bytes of RLE payload:

```
byte 0   0xD1        magic
byte 1   seq         wraps at 256 — lets firmware drop a stale half-frame
byte 2-3 index       big-endian packet number
byte 4-5 total       big-endian packet count
byte 6+  payload     RLE pairs: [count:1][value:1]
```

Reassemble by index, RLE-decode, blit. **A frame missing a packet is discarded
whole, never shown torn.** Packet order does not matter — there is a test that
reassembles a reversed packet list byte-identically.

Pull real packets to develop against:

```bash
curl -s -X POST localhost:8080/v1/display \
  -H 'Content-Type: application/json' \
  -d '{"text":"नमस्ते","lang":"hi","format":"packets"}'
```

### Seeing it without hardware

`POST /v1/display` also returns the frame as a PNG, and the app shows it in a
lens-shaped panel above every answer. **That image is not a mockup** — it is the
same framebuffer the firmware will blit, rendered green on black. Until the
display hardware exists this is the only honest way to look at the product, so
it lives in the app rather than in a side tool nobody runs.

## 4. The routing rule, and why it is not "use whatever is configured"

We tested every language by generating speech with Piper and feeding it back into
the recogniser. Hindi came back clean. **Bengali, Marathi and Telugu came back in
the wrong script entirely** — Whisper transcribes Indic speech into Devanagari
regardless of what was actually spoken. Telugu was identified as Malayalam.
Upgrading `small` → `medium` improved language *detection* and did not fix the
transcription; it is a decoder bias, not a size problem.

So the system carries a measured quality rating per language
([`gateway/drishti/languages.py`](gateway/drishti/languages.py)) and routes on it:

```
prefer local  →  fall back to cloud  →  fail loudly, never silently
```

Concretely, `POST /v1/listen` with `lang=te` **never reaches Whisper** when cloud
recognition is available. It does not "try local first" — we already know local is
wrong for Telugu, and a confidently wrong transcription is worse than an error. A
farm worker acting on a mistranscribed question can lose a crop.

Every response carries two fields:

- **`via`** — which backends actually served it (`whisper+nllb+piper`)
- **`degraded`** — whether we left the local path

The app shows `degraded` as **"sent over the internet"** in the person's own
language. Someone deserves to know when their voice left the device. That is a
privacy fact, not an implementation detail.

`/v1/languages` reports this honestly per language, so the app can grey out a
feature instead of letting someone tap a thing that will fail:

```json
"ta": { "speak":  { "available": false, "local": false },
        "listen": { "available": false, "local_quality": "poor" } }
```

Tamil has **no Piper voice at all**. The system says so rather than pretending.

---

## 5. Safety

A 1-billion-parameter quantised model answering *"how much pesticide per acre"*
is not a feature. It is a liability with a friendly voice.

Before any model is consulted, the English pivot text is checked for high-stakes
topics — dosage, chemicals, legal exposure — and those are refused with a
redirect to someone real:

> *"I am not able to advise on chemicals or doses. Please ask your local
> agriculture officer."*

Verified: with an answering model that would have replied *"Take 500mg twice
daily"*, the user receives the refusal instead. **The guard runs even when no
answering model is configured at all** — safety does not depend on the risky
component being present.

**Honest limits of this.** It is keyword matching on English text. It will miss
phrasings, and it cannot catch a harmful answer to an innocuous-sounding
question. It is a floor, not a guarantee. The real fix is routing these questions
to actual authorities — a doctor, the district agriculture officer, a legal aid
line — which is a partnership problem, not something a filter solves. Do not ship
this to farmers as agricultural advice without that work.

---

## 6. What we removed

The app went from 24 source files to 3.

| Removed | Why |
|---|---|
| Photo grid capturing every 5 s | Surveillance-shaped, and nobody asked for it |
| `Agent.ts` + image descriptions | Built for a demo about remembering rooms |
| `moondream` vision model | Slow, heavy, not part of any of the three features |
| OpenAI, Groq, Ollama clients | Cloud, paid, English-first — the opposite of the goal |
| 8 backend modules, 7 base URLs | One gateway, one contract |
| `prompts/` (3.3 MB, 57 images) | Dead weight from the original demo |
| `keys.ts`, 3 API keys | Nothing to sign up for now |

Kept and rewritten: the BLE bridge, the language registry, the recorder.

---

## 7. What does not work yet

Stated plainly so nobody discovers these the hard way.

1. **Speech recognition is only reliable in Hindi and English.** Bengali,
   Marathi, Telugu, Tamil and Punjabi need cloud recognition, which needs
   Bhashini credentials we do not have. **This is the biggest hole in the
   product.** Fix: AI4Bharat's IndicConformerASR, which is built for exactly
   this and is not yet integrated.
2. **Tamil and Punjabi cannot be spoken locally.** Piper has no voice. Cloud only.
3. **The Bhashini path has never run against the live service.** It follows the
   documented pattern; it needs credentials to verify. `available()` returns
   false without them, so the system degrades honestly rather than pretending.
4. **Answering needs a local LLM you install separately.** Nothing ships with an
   answering model. Without one, ASK reports that clearly and the other two
   features keep working.
5. **No display firmware, and no display hardware.** The whole render-and-encode
   path is built and tested — frames, compression, BLE packets — but nothing
   consumes it yet. The reference board (omiGlass) is a *camera* device whose
   firmware has no panel and no display characteristic. What is missing is
   (a) an optical engine to buy and (b) ESP32 firmware implementing the wire
   format in §3a. The app's lens preview stands in until then, and it shows the
   real framebuffer, not a mockup.
6. **The renderer has never driven a physical panel.** Threshold, minimum text
   size and line height are reasoned from the panel spec and look right in the
   preview. They will need one afternoon of tuning against real optics, in
   daylight, on someone's face.
7. **Answers are not verified.** There is no live weather, no mandi prices, no
   authoritative source behind ASK — just a general-knowledge model. Useful for
   *"what does this word mean"*, not for *"what is tomatoes selling at today"*.
8. **READ is parked** (camera → OCR → speech). Implemented and tested, not
   being developed while the display is the focus.

---

## 8. Running it

```bash
# one service, one port
cd ~/openglass-multilingual/gateway
source ../piper-venv/bin/activate
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
python3 -m drishti.server            # :8080

# the app
cd ~/openglass-multilingual/omi/omiGlass
npm start                            # :8081
```

Optional, to switch ASK on — any OpenAI-compatible endpoint:

```bash
ollama serve && ollama pull llama3.2:1b
# then in gateway/config.toml:  [answer] url = "http://localhost:11434/api/chat"
```

Check what is actually up before debugging anything else:

```bash
curl -s localhost:8080/v1/health | python3 -m json.tool
```

### Where it runs

| Box | Verdict |
|---|---|
| Laptop / desktop | Everything, comfortably |
| Phone (as the hub) | Everything — the default deployment |
| Raspberry Pi 4/5, 4 GB (~₹5,000) | Everything |
| **Raspberry Pi Zero 2 W, 512 MB** | **Piper only.** NLLB-200 needs well over 1 GB. |

Correcting an earlier claim in `docs/`: a ₹1,200 Pi Zero cannot run this stack.
Either the phone is the hub — which is the honest default, since these users
already own one — or the hub is a Pi 4-class board at roughly ₹5,000.

### Tests

```bash
cd gateway && python3 -m pytest tests/ -q     # 52 passed in 2.9s
```

**52 tests.** The pipeline ones use fakes and load no models, so routing policy —
*does Telugu avoid Whisper, is a dosage question refused, is a missing voice
reported* — is verifiable in milliseconds. The display ones render for real,
because the bug they guard against is visual. Two have already earned their
keep: one caught an error telling users to edit `config.yaml` when the file is
`config.toml`, and the shaping pair is the only reason the Telugu rendering bug
in §3a cannot come back unnoticed.

---

## 9. API

All responses are JSON. Audio arrives as base64 WAV in `audio_base64`.
Failures return `ok: false` with a `code` the app localises — a Telugu speaker
gets a Telugu sentence, not ours.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /v1/health` | — | status, which backends are up |
| `GET /v1/languages` | — | per-language speak/listen/translate capability |
| `POST /v1/ask` | `audio` or `text`, `lang` | `question`, `answer`, audio, **display** |
| `POST /v1/understand` | `audio`, `from`, `to` | `heard`, `text`, audio, **display** |
| `POST /v1/display` | `text`, `lang`, `page?`, `format?` | PNG, or BLE `packets_base64` |
| `POST /v1/read` *(parked)* | `image`, `image_lang`, `lang` | `found`, `text`, audio |
| `POST /v1/speak` | `text`, `lang` | audio |
| `POST /v1/listen` | `audio`, `lang?` | `text`, detected language |
| `POST /v1/translate` | `text`, `from`, `to` | `text` |

Error codes: `didnt_catch`, `no_answer_model`, `no_voice`, `cannot_listen`,
`no_ocr`, `no_text_found`, `no_translation`, `no_display`, `unknown_language`,
`unavailable`.
