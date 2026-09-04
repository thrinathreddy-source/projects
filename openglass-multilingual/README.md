# Drishti

Smart glasses that answer you in your own language — offline, with no account
and no subscription.

A person presses one button, speaks Telugu, and hears Telugu back. That is the
whole product. Everything in this repository exists to make that sentence true
for someone who cannot read English and cannot afford a monthly fee.

| Track | State |
|---|---|
| **Software** — gateway, app, language pipeline | **Working.** Runs today on a laptop or phone. |
| **Hardware** — monocular birdbath display glasses | **Planning only.** Nothing built or bought. See [BUILD_PROCESS.md](BUILD_PROCESS.md). |

---

## What it does

Three things, deliberately.

- **ASK** — say a question, hear a short answer. *"When does the bank open?"*
- **UNDERSTAND** — someone speaks a language you don't; you get yours.
- ~~**READ** — camera → text → speech.~~ **Parked** while the display is the focus.

Every answer also comes back as a **640×200 one-bit frame** for the glasses,
compressed and packetised for BLE. The app shows it in a lens panel — that image
is the real framebuffer, not a mockup.

No accounts, no sync, no history, no feed, no settings beyond choosing your
language. **[ARCHITECTURE.md](ARCHITECTURE.md)** explains exactly how each one
works, what it costs in latency, and what does not work yet.

---

## Start it

```bash
# 1. the gateway — one process, one port, everything behind it
cd ~/openglass-multilingual/gateway
source ../piper-venv/bin/activate
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
python3 -m drishti.server                    # :8080

# 2. the app
cd ~/openglass-multilingual/omi/omiGlass
npm install                                  # first time only
npm start                                    # :8081 — open it in a browser
```

Optional, to switch ASK on (nothing else needs it):

```bash
ollama serve && ollama pull llama3.2:1b
# gateway/config.toml →  [answer] url = "http://localhost:11434/api/chat"
```

Sanity check before debugging anything:

```bash
curl -s localhost:8080/v1/health | python3 -m json.tool
```

---

## Layout

```
ARCHITECTURE.md          how the software works, what it offers, what it can't do
BOM.md                   full bill of materials, 7 subsystems, 3 volume tiers
BUILD_PROCESS.md         how to build the hardware — phases, gates, costs, risks
docs/                    hardware feasibility, production plan, product concept
gateway/                 the service — 5 modules, 52 tests
  drishti/display.py       THE DISPLAY — shaping, 1-bit raster, BLE wire format
  drishti/languages.py     measured capability per language (start here)
  drishti/backends.py      Piper, Whisper, NLLB, Bhashini, LLM
  drishti/pipeline.py      routing policy, safety guard, the features
  drishti/server.py        HTTP surface
  config.toml              everything configurable, all with working defaults
omi/omiGlass/            the app — 3 source files
  sources/drishti.ts       the only client
  sources/app/Main.tsx     the entire interface
  sources/app/strings.ts   the interface, in 7 languages
piper-voices/            TTS voice models (~328 MB, not in git)
piper-venv/              the one environment (all model libraries)
```

---

## Three things worth knowing before you change anything

**The gateway is one process on purpose.** It used to be seven — five Piper
servers on five ports, plus translation, plus recognition. That was an accident,
not a design: Piper's bundled CLI server loads one voice, so five voices looked
like five servers. `PiperVoice.load()` returns an object; a dict of them works
fine. If you find yourself starting a second process, check that assumption first.

**Indic text must be shaped, never just drawn.** Pillow here has no Raqm, and
rendering Telugu without shaping produces broken glyph soup — base consonant,
floating virama, detached vowel — while *Hindi still looks fine*, so a casual
check passes. That is why [`display.py`](gateway/drishti/display.py) uses
HarfBuzz + FreeType directly. Two tests guard it; don't route text around them.

**Language capability is measured, not assumed.**
[`gateway/drishti/languages.py`](gateway/drishti/languages.py) carries a quality
rating per language that came from a closed-loop test, and the pipeline routes on
it. Telugu speech recognition never reaches Whisper, because we measured Whisper
transcribing Telugu into Devanagari and calling it Malayalam. A confidently wrong
answer is worse than an error. Edit that table only with a test to back it up.

---

## What does not work yet

The full list with detail is in [ARCHITECTURE.md §7](ARCHITECTURE.md). The three
that matter most:

1. **Speech recognition works properly only in Hindi and English.** The other
   five languages need cloud recognition (Bhashini credentials we don't have) or
   AI4Bharat's IndicConformerASR, which isn't integrated. **This is the biggest
   hole in the product.**
2. **Tamil and Punjabi have no local voice.** Piper has none. Cloud only.
3. **No display firmware or hardware.** The render → compress → packetise path is
   built and tested, but nothing consumes it: there is no optical engine bought
   and no ESP32 firmware implementing the wire format. The app's lens preview
   stands in, showing the real frame.

---

## Tests

```bash
cd gateway && python3 -m pytest tests/ -q     # 52 passed in 2.9s
```

They cover routing policy, the safety guard, and — rendering for real — the
Indic shaping that would otherwise ship broken.

---

## Next

**Hardware, this week:** order a RayNeo Air 2 (~₹13,000) and display our rendered
Telugu frames on it outdoors. It is a complete birdbath micro-OLED display that
takes video over USB-C — an optical test bench for the price of a phone, and it
answers the biggest open question in the project before you design anything.
See [BUILD_PROCESS.md](BUILD_PROCESS.md) Phase 0.

**Firmware:** write the ESP32 side of the wire format in
[ARCHITECTURE.md §3a](ARCHITECTURE.md) — reassemble by index, RLE-decode, blit.
`POST /v1/display` with `format=packets` gives you real frames to develop
against today, before any panel exists.

**Speech:** integrate IndicConformerASR and re-run the closed-loop test. That
single change takes the product from "works in Hindi" to "works in six languages".

**Hardware:** email JBD for the monochrome Hummingbird Mini dev kit and pricing at
100 / 1,000 / 5,000 units. That reply converts the display cost from a
triangulated estimate into a real number — see [docs/](docs/).

---

## Licences

omiGlass MIT · Piper MIT · faster-whisper MIT · NLLB-200 (Meta, open weights) ·
Tesseract Apache-2.0 · AI4Bharat models open weights. Everything self-hosts with
no per-call fee; the only cost is compute you already own.
