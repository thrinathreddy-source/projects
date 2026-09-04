# Multilingual OpenGlass — Build Guide

Forked from **`omiGlass`** (inside [BasedHardware/omi](https://github.com/BasedHardware/omi)), not the standalone `OpenGlass` repo you originally pointed at — that repo's README says it's archived ("moved to Omi, current repo isn't supported anymore"). `omiGlass` is the same $25 XIAO ESP32-S3 camera-glasses hardware, actively maintained, with a better frame (real multi-part STLs, not one clip) and a proper PlatformIO firmware build.

A local working copy is already checked out at `~/openglass-multilingual/omi/omiGlass` (sparse-checkout — just this subfolder, not the whole monorepo, since the monorepo is large).

> ## ⚠️ Historical — read [ARCHITECTURE.md](ARCHITECTURE.md) instead
>
> This is the build log of how the software got here, milestone by milestone. It
> is kept because the reasoning is useful — particularly Milestone 0 (buying and
> flashing the XIAO ESP32-S3) and the measured findings about Indic speech
> recognition, which still hold.
>
> **The architecture it describes no longer exists.** Seven servers became one
> gateway; eight client modules became one. Commands and file paths below are
> stale. For how the software works today, what it offers, and what it cannot do,
> read **[ARCHITECTURE.md](ARCHITECTURE.md)**.
>
> Hardware planning lives in [`docs/`](docs/):
> [01 feasibility](docs/01-hardware-feasibility.html) ·
> [02 production plan](docs/02-first-batch-framework.html) ·
> [03 product concept](docs/03-product-concept.html).

## Why fork, not use as-is

Stock `omiGlass` calls OpenAI for TTS and (optionally) Groq/OpenAI for Q&A — cloud, English-only, pay-per-call. The goal here is the same device, but:
- **Self-hosted** — no per-call fee, matches the "open hardware, not just a service" goal from the original sketch.
- **Multilingual** — a farmer in Maharashtra, a student in Seoul, and someone in rural Portugal should each get answers in their own language, not English.

## Milestone 0 — Get stock hardware working, unmodified

Don't touch code until the hardware is confirmed working. Skipping this step is the #1 cause of "is it my glasses or my code" debugging loops.

1. **Buy**: [Seeed XIAO ESP32S3 Sense](https://www.seeedstudio.com/XIAO-ESP32S3-Sense-p-5639.html) (~$14, camera+mic already on board), a 3.7V LiPo battery, a 3D printer (or a print service) for the frame.
2. **Print**: STLs are in `omi/omiGlass/hardware/` — `Frame_Back_v5.stl.stl`, the left/right temple pieces, and front cover left/right. (There's also an `openglass-old/` folder with the original single-piece OpenGlass case if you want the simpler print first.)
3. **Flash firmware** — two options:
   - Fast path: drag `omi/omiGlass/firmware/releases/omi_glass_firmware.uf2` onto the board in bootloader mode.
   - Full path: `cd omi/omiGlass/firmware && platformio run -t upload` (it's a PlatformIO project now, not a bare Arduino sketch — `platformio.ini` is already there).
4. **Run the stock app**:
   ```bash
   cd ~/openglass-multilingual/omi/omiGlass
   npm install
   cp .env.template .env   # fill in Groq + OpenAI keys, just for this smoke test
   ollama pull moondream:1.8b-v2-fp16
   npm start
   ```
   Confirm: glasses pair over BLE, a photo produces a description, typing a question gets a spoken English answer. That's the full pipeline working before any changes.

## Milestone 1 — Swap cloud TTS for local, multilingual TTS

**File**: `sources/modules/openai.ts` — `textToSpeech(text)` currently POSTs to `api.openai.com/v1/audio/speech`.

Replace the body with a call to a self-hosted **[Piper](https://github.com/rhasspy/piper)** server (MIT license, runs fine on a Raspberry Pi–class hub, has voices for dozens of languages including Hindi, Marathi, Tamil, Mandarin, Vietnamese, most European languages). Add a `lang` parameter so the voice model is selectable:

```ts
export async function textToSpeech(text: string, lang: string) {
  const response = await axios.post(`${keys.piperUrl}/api/tts`, { text, voice: lang }, { responseType: 'arraybuffer' });
  // decode + play same as before
}
```

Add `piperUrl` to `sources/keys.ts` and `.env.template`, next to the existing `openai`/`groq`/`ollama` entries — same pattern already used in this file.

**Status: done.** `sources/modules/openai.ts` now dispatches to `piper.ts` (new) or `bhashini.ts` (new) instead of calling OpenAI. Verified working end-to-end against a real local server:

```bash
cd ~/openglass-multilingual
python3 -m venv piper-venv && source piper-venv/bin/activate
pip install piper-tts flask certifi

# macOS SSL fix - the stock python.org build has no CA bundle wired up:
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")

mkdir -p piper-voices
python3 -m piper.download_voices --download-dir piper-voices en_US-lessac-medium

# macOS: port 5000 is claimed by AirPlay Receiver - use 5001
python3 -m piper.http_server -m piper-voices/en_US-lessac-medium.onnx --port 5001
```

Then `curl -X POST -H 'Content-Type: application/json' -d '{"text": "hello"}' -o test.wav http://localhost:5001/synthesize` returns a valid WAV.

**Known gap found during testing**: `piperTextToSpeech(text, lang)` sends `lang` as the `voice` field, but a single-model server (one `-m` flag) ignores it and always speaks in whatever voice is loaded — passing `"hi"` to a server running `en_US-lessac-medium` silently produces English, not an error. To actually get per-language voices working, either run one Piper server per language on different ports (simplest), or check whether your Piper version's `http_server` supports loading multiple `-m` voices at once and selecting by name (need to confirm against your installed version — this wasn't tested here). The `languagePacks.ts` registry in Milestone 4 should map each language to its own `piperUrl`/port, not just a voice string, until that's resolved.

## Milestone 2 — Add a translation layer

**File**: `sources/agent/imageDescription.ts` — `imageDescription()` and `llamaFind()`/`openAIFind()` produce English text (Ollama's `moondream` is already local — good, keep that). The gap is: nothing translates the output.

**Status: done.** Went with a single self-hosted **NLLB-200** server rather than IndicTrans2 + LibreTranslate — one 600M-parameter model covers all 6 named languages (plus 194 more) with one `source_lang`/`target_lang` pair per call, instead of needing IndicTrans2's custom tokenizer setup on top of a second translation stack. IndicTrans2 is still the better call if Indic translation *quality* becomes the bottleneck later — NLLB is the generalist, IndicTrans2 the specialist.

```bash
cd ~/openglass-multilingual
python3 -m venv translate-venv && source translate-venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers sentencepiece flask numpy

python3 nllb_server.py   # downloads facebook/nllb-200-distilled-600M on first run, serves on :5010
```

`nllb_server.py` is a ~30-line Flask wrapper: `POST /translate {text, source_lang, target_lang}` (FLORES-200 codes, e.g. `eng_Latn`, `hin_Deva`) → `{translation}`.

`sources/modules/translate.ts` calls that endpoint. `languagePacks.ts` gained an `nllbLang` field per entry (a different code space than `piperUrl`/`bhashiniLang` — NLLB and Piper are unrelated projects with their own naming). `Agent.ts`'s `answer(question, lang)` now: gets the English answer from `llamaFind`, translates it via the target language's `nllbLang`, displays *and* speaks the translated text.

Verified end-to-end (not just the translate server in isolation) — same English sentence run through translate → the correct language's Piper server, for Telugu and Bengali, producing correct audio in both.

## Milestone 3 — Voice input

**Status: done, with a real accuracy caveat found during testing.** Turned out `agent.answer()` was never called from the UI at all in stock `omiGlass` — no text box, no voice, nothing. So this wasn't "swap typed input for voice," it was building the first working input path.

```bash
cd ~/openglass-multilingual
python3 -m venv asr-venv && source asr-venv/bin/activate
pip install faster-whisper flask av   # av decodes browser-recorded audio without needing system ffmpeg

python3 whisper_server.py   # downloads faster-whisper "small" on first run, serves on :5020
```

`whisper_server.py` — `POST /transcribe`, multipart field `audio` → `{text, language, language_probability}`, auto-detects language (no need to tell it what's being spoken).

`sources/modules/whisper.ts` calls that endpoint. `sources/app/DeviceView.tsx` got an actual input UI for the first time: a record button (browser mic via `MediaRecorder` — **not** the glasses' own mic; the firmware's `mic.cpp`/`opus_encoder.cpp` already captures and Opus-encodes audio over BLE, but the app doesn't consume that characteristic yet, and wiring it needs physical hardware present to test against, so it's out of scope here) plus a language-override chip row, plus — also newly added — the answer is now actually displayed on screen (it wasn't rendered anywhere before either).

**Accuracy finding, from a closed-loop test** (fed Piper's own generated audio back into Whisper — same audio used to verify Milestone 1):
| Language | Detected | Confidence | Transcription quality |
|---|---|---|---|
| Hindi | hi | 98% | Good |
| Bengali | bn | 41% | Wrong script (came out in Devanagari) |
| Marathi | mr | 36% | Wrong script (came out in Devanagari) |
| Telugu | **ml** (misdetected as Malayalam) | 50% | Wrong language *and* script |

Only Hindi was reliable. The "small" model just isn't good enough for Bengali/Marathi/Telugu — this is exactly why the language-override chips exist in the UI rather than trusting auto-detect alone. Two ways to actually fix this later, not attempted here: step up to Whisper "medium" (slower, ~1.5GB, better multilingual coverage) or switch to AI4Bharat's `IndicConformerASR` for the Indian-language case specifically, same specialist-vs-generalist tradeoff as Milestone 2's translation choice.

## Milestone 4 — One config, many languages

**Status: done for TTS**, scoped to the 6 languages named earlier (Hindi, Bengali, Marathi, Telugu, Tamil, Punjabi). `sources/modules/languagePacks.ts` is a real registry now, not a sketch:

```ts
export const languagePacks: Record<string, LanguagePack> = {
  'en': { piperUrl: 'http://localhost:5001' }, // en_US-lessac-medium
  'hi': { piperUrl: 'http://localhost:5002' }, // hi_IN-pratham-medium
  'bn': { piperUrl: 'http://localhost:5003' }, // bn_BD-google-medium
  'mr': { piperUrl: 'http://localhost:5004' }, // mr_IN-google-medium
  'te': { piperUrl: 'http://localhost:5005' }, // te_IN-venkatesh-medium
  'ta': { bhashiniLang: 'ta' }, // no Piper voice for Tamil
  'pa': { bhashiniLang: 'pa' }, // no Piper voice for Punjabi
};
```

`openai.ts`'s `textToSpeech(text, lang)` looks up `languagePacks[lang]` and routes to that language's own Piper server (or Bhashini, for the two languages Piper has no voice for). This exists **because** the single-server design in Milestone 1 turned out not to work — one Piper process only ever speaks the voice it was started with, so "many languages" means "many server processes," one per port:

```bash
# from ~/openglass-multilingual, with piper-venv activated
python3 -m piper.download_voices --download-dir piper-voices \
  hi_IN-pratham-medium bn_BD-google-medium mr_IN-google-medium te_IN-venkatesh-medium

python3 -m piper.http_server -m piper-voices/hi_IN-pratham-medium.onnx --port 5002 &
python3 -m piper.http_server -m piper-voices/bn_BD-google-medium.onnx --port 5003 &
python3 -m piper.http_server -m piper-voices/mr_IN-google-medium.onnx --port 5004 &
python3 -m piper.http_server -m piper-voices/te_IN-venkatesh-medium.onnx --port 5005 &
```

Verified against the real code path (not just curl) — each language produced distinct, correct audio.

**Coverage gap, confirmed against Piper's actual voice catalog** (`huggingface.co/rhasspy/piper-voices/resolve/main/voices.json`): Piper has zero voices for Tamil or Punjabi. `languagePacks.ts` routes those two through Bhashini instead — there's no Piper fallback available for them, period, not just a config gap.

For Europe/East Asia, the same catalog does have voices worth knowing about for later: `de_DE`, `fr_FR`, `es_ES`/`es_MX`/`es_AR`, `it_IT`, `pt_PT`/`pt_BR`, `pl_PL`, `ru_RU`, `ko_KR`, `zh_CN`, `vi_VN`, and ~40 others — same one-port-per-language pattern applies.

Once Milestone 2's translation layer is wired in, `Agent.ts` reads the active pack once per request; everything downstream (`translate.ts`, `textToSpeech`) takes the pack's config instead of hardcoding one language.

## Milestone 5 — Verifying all of this without the hardware

No glasses yet doesn't mean no verification. Two things made the rest of this checkable:

**1. A real bug, found by finally running `npm install` + `tsc` for real** (every check before this milestone used a throwaway standalone `tsc` invocation with `--ignoreConfig`, which papers over project-level errors). `sources/modules/imaging.ts`'s `rotateImage()` only accepted `'90' | '180' | '270'`, but `DeviceView.tsx` passes `'0'` for firmware ≥2.1.1's upright orientation - so it silently fell through to the `else` branch and **actually rotated photos 270° instead of 0°**, plus unconditionally swapped canvas width/height even when it shouldn't have. Fixed both the type and the rotation math. Project now compiles with zero errors.

**2. Demo mode** - `Main.tsx` got a "Don't have the glasses yet? Try demo mode" option that renders `DeviceView` without a real BLE connection (`usePhotos` just skips its BLE calls when `device` is `null` - photo grid stays empty, everything else is identical). This let the actual app run in a real browser and be clicked through, not just reasoned about:

```bash
cd ~/openglass-multilingual/omi/omiGlass
cp .env.template .env   # fill in the Piper/NLLB/Whisper URLs; Groq/OpenAI/Bhashini can stay blank for this
npm start               # Metro serves the web build at http://localhost:8081
```

Verified in-browser: demo mode renders, all 8 language chips (`auto`, `en`, `hi`, `bn`, `mr`, `te`, `ta`, `pa`) work and highlight correctly on click, and pressing "Ask a question" correctly calls `getUserMedia` and hits the mic-permission path. (The browser sandbox used for this session blocks real mic capture and shows the user a notice instead of faking it - so actual speech-to-answer wasn't recorded end-to-end here, but the button, the permission request, and the error handling all fired exactly as coded, with no crash and no stuck UI state. That last mile - real audio in a real browser - is on you or the next session with a normal browser.)

## On "forking" — a note

GitHub's Fork button would fork the *entire* `omi` monorepo (backend, mobile app, everything), since `omiGlass` is a subfolder, not its own repo. Two real options:
1. Fork all of `omi` on GitHub (one click, simplest, but you're carrying a large unrelated codebase) — [github.com/BasedHardware/omi](https://github.com/BasedHardware/omi) → Fork.
2. What's already set up locally: a sparse checkout of just `omiGlass`, detached from `omi`'s history. Push it to a **new empty repo you create** and it becomes its own standalone project:
   ```bash
   cd ~/openglass-multilingual/omi/omiGlass
   git remote remove origin  # detach from omi
   git remote add origin <your-new-empty-github-repo-url>
   git push -u origin main
   ```
   (Do this yourself in a terminal — pushing to a new remote is your call, not something to automate without you present.)

## License notes

`omiGlass` (MIT) · IndicTrans2 (MIT) · NLLB-200 (open, Meta) · Piper (MIT) · whisper.cpp (MIT) · LibreTranslate (MIT). Everything in this stack can be self-hosted with no per-call fee — the thing you're actually paying for anywhere is compute (a phone or a ~$15 hub board), never a subscription.
