# Build process — monocular waveguide display glasses

The end-to-end process for the device we settled on: **one eye, monochrome green
waveguide, phone-tethered, no camera.** BOM ~$76 at 10k units (see [BOM.md](BOM.md)).

**Why not birdbath.** An earlier draft of this document specced birdbath optics
because they are cheaper. That failed a product-logic check: birdbath is tinted,
so it is a put-it-on-when-needed device — and if usage is episodic, the phone in
your pocket already does the job for free. Glasses only earn their existence when
the display can stay on your face all day, which needs a clear, see-through
waveguide. Worse, the display's strongest use — live conversation subtitles — is
exactly where dark glasses are socially unacceptable. Birdbath saved money by
removing the reason to build the product.

This supersedes the hardware path in [`docs/02-first-batch-framework.html`](docs/02-first-batch-framework.html),
which was written for the sealed-waveguide device. That document is still correct
on **certification, capital and tooling economics** — none of that changes with
the optics. Read it for those sections.

---

## What is already done

Do not re-do this. It is built, tested and running.

| | State |
|---|---|
| Language pipeline (speech, translation, speech-out) | **Done.** 52 tests. |
| Indic text shaping + 1-bit rasteriser | **Done.** All six scripts verified. |
| Frame compression + BLE wire format | **Done.** Round-trip tested, out-of-order safe. |
| Companion app | **Done.** 3 source files, 7 languages. |
| Gateway | **Done.** One process, one port. |

**What does not exist:** firmware, electronics, mechanical design, and a display
you can hold. That is what this document is about.

---

## Phase 0 — Prove someone can actually read it

**2–4 weeks · ~₹50,000 · this gate kills or saves the project**

Everything downstream assumes a monochrome green waveguide is legible enough, in
Indian daylight, for a person to read Telugu on it. That assumption is unverified
and it is cheap to test now and ruinous to test after tooling.

### Do not design anything yet. Buy the competitor.

**Buy an Even Realities G1 (~$599) or Rokid Glasses (~$499).** Both are shipping
monochrome micro-LED waveguide devices — the exact optical technology we would
build on. G1 has a teleprompter mode that will display arbitrary text you send
it, which is all we need.

For ~₹50,000 you get an optical test bench running the real technology.
Designing your own hardware to answer this question would cost twenty times more
and six months longer.

> Do **not** substitute a cheaper RayNeo Air or Xreal for this test. Those are
> birdbath viewers — different brightness, different transparency, different
> field of view. Legibility on a tinted birdbath tells you nothing about
> legibility on a clear waveguide.

```bash
# generate the real frames to test with
curl -s -X POST localhost:8080/v1/display \
  -H 'Content-Type: application/json' \
  -d '{"text":"రేపు వర్షం పడుతుంది. విత్తనాలు వేయవద్దు.","lang":"te"}' \
  | python3 -c "import json,sys,base64; open('frame.png','wb').write(base64.b64decode(json.load(sys.stdin)['png_base64']))"
```

Then display `frame.png` full-screen on the glasses and go outside.

### The gate

Take it to **five Telugu speakers, outdoors, at midday.** Not colleagues —
actual intended users.

- Can they read a full sentence without shading their eyes?
- Do the conjuncts read correctly, or do they say the words look wrong?
- Would they wear it for an hour?

**If no:** a monochrome waveguide HUD is not viable for outdoor use, and the
honest fallback is the audio-only device — which needs no display at all, costs
₹1,300, and serves non-literate users better anyway. Better to learn that for
₹50,000 than for ₹50 lakh.

---

## Phase 0.5 — Legal rails (parallel, weeks 1–6, ₹40–80k)

Boring and blocking. Start day one so it finishes while you prototype.

- **Pvt Ltd** (or LLP)
- **IEC from DGFT** — you legally cannot import the display module without it
- **GST** — you want the input credit on components
- A customs broker who has cleared electronics before

---

## Phase 1 — Source the optics, and prove an ESP32 can drive them

**4–8 weeks · ₹40,000–80,000 · this is the phase that decides the price**

Optics are **78% of the BOM**. Everything else is commodity parts whose prices we
can already defend. This phase exists to turn one triangulated estimate into a
real quote.

### The single most important spec decision

Light engines ship with different interfaces, and this choice decides the whole
electronics architecture:

| Interface | Consequence |
|---|---|
| **Parallel RGB / video @60 Hz** | An ESP32 **cannot** drive it. You need a video-capable SoC — +$12–15, more power, more board, worse battery. |
| **SPI / I²C** | ESP32-C3 drives it directly. No video SoC at all. |

**Insist on the SPI variant.** We push static text a few times a minute, not
60 fps video. This deletes an entire chip and kills the earlier assumption that
the glasses need a video-capable hub.

### Shortlist to quote

| Supplier | Why |
|---|---|
| **Lingxi AR** (灵犀微光) | Explicitly makes **monochrome** as well as RGB, states a compensation system for "stable manufacturing at lower cost", 12 g module, Sunny Optical–backed. **Email first.** |
| **Lochn Optics** | Shenzhen. Only Chinese firm in the global top 10 by AR waveguide patents. |
| **Crystal Optech** | DigiLens's first China licensee, large-scale optical manufacturer. |
| **JBD** | The light engine behind G1 and RayNeo. Ask for Hummingbird monochrome pricing. |

The email, verbatim, is at the bottom of [BOM.md](BOM.md). Ask every one of them
for **price at 100 / 1,000 / 5,000 / 20,000, MOQ, whether the light engine is
included or separate, whether the driver/TCON is integrated, and SPI vs
parallel.**

### Gate

An **ESP32-C3** dev board displaying our rendered Telugu frame on the real
optics, received over BLE using the wire format in
[ARCHITECTURE.md §3a](ARCHITECTURE.md).

---

## Phase 2 — Firmware

**Runs alongside Phase 1 · 4–6 weeks**

This is the one genuinely new piece of software, and it is small because the hard
parts are already solved on the gateway side.

The ESP32 has to do exactly four things:

1. **Advertise a BLE display characteristic** and accept notifications
2. **Reassemble packets by index** — 6-byte header: magic `0xD1`, seq, index, total
3. **RLE-decode** — `[count][value]` pairs, straight into the framebuffer
4. **Blit to the panel over SPI**

Rules, all of which the gateway already assumes:

- A frame with a missing packet is **discarded whole, never shown torn**
- A new `seq` invalidates any half-assembled frame
- 640×200 ÷ 8 = **16,000 bytes** of framebuffer — fits comfortably in the
  **ESP32-C3's** ~400 KB SRAM, so no PSRAM and no S3 needed

Develop against real packets before any panel arrives:

```bash
curl -s -X POST localhost:8080/v1/display \
  -H 'Content-Type: application/json' \
  -d '{"text":"नमस्ते","lang":"hi","format":"packets"}'
```

---

## Phase 3 — Integration prototype

**2–4 months · ₹4–8 lakh**

> ### ⛔ Design constraint that must be settled before you draw anything
>
> **The optical engine is a replaceable module.** It connects through a
> board-to-board or FPC connector and comes out without destroying the frame.
> Not bonded, not potted, not glued.
>
> This is a **commercial** requirement, not an engineering preference, and it
> cannot be retrofitted — it dictates the temple geometry, the fastening method
> and the alignment scheme, so it has to be decided now.
>
> **Why:** the optics are 78% of the BOM; we cannot afford service centres; and
> the only affordable service model is a local phone repair shop swapping a
> module. Even Realities' own docs say accessing their internals needs
> *"destructive disassembly"* — which is exactly why their customers report
> warranty claims reclassified as "human damage." When repair is impossible,
> denial is the only economics that works. Meta will never let a neighbourhood
> shop open a Ray-Ban Display. This is the one thing neither can copy.
>
> **What it forces:**
> - Temple opens with **screws**, not ultrasonic welding or adhesive
> - Optical alignment held by a **machined mechanical datum**, not glue
> - A swapped module must land in alignment **with no instruments and no
>   calibration step** — a repair shop has no optical bench
> - Cost: ~$0.50–1.00/unit in connector and fasteners, plus some temple thickness
>
> **Design the alignment datum first.** Everything else in the mechanical design
> follows from it. See [BOM.md](BOM.md) for the full rationale.

- Custom PCB: **ESP32-C3** (16 KB framebuffer fits its SRAM — the S3's PSRAM is
  not needed), regulators for the engine's rails, charging, mic
- Flex circuit into the temple, terminating in the **optical engine connector**
- Frame CAD **built around the optical module** — its bulk drives the industrial
  design, not the other way round
- 3D print and iterate. Expect ten-plus revisions before the optics sit right in
  front of the eye

**Budget 3–4 PCB spins.** First-spin-works is luck, not a plan.

### Weight

G1 is **under 40 g binocular**. We are monocular — one waveguide, one light
engine — with no camera and no application processor, so **30–38 g is a
reasonable target**, at or slightly under G1.

(An earlier draft of this document said 45–60 g. That was for the birdbath
design, which is physically bulkier — RayNeo Air 2 is ~76 g. Dropping birdbath
put the weight target back where it started.)

Borrow G1's other trick: it ships a **charging case with its own battery**, so
the glasses only carry hours of capacity rather than days. That is what keeps
the 250 mAh cell in [BOM.md](BOM.md) small enough to sit on someone's face.

### Gate

8 hours battery · under 40 g · someone wears it through a market and nobody
comments.

---

## Phase 4 — EVT, then DVT

**EVT: 5–10 units, ₹3–5 lakh · DVT: 20–30 units, ₹5–8 lakh**

EVT is the first time you build more than one, and where you find out which
assembly steps are impossible with human hands. Write the assembly procedure as
you build — it becomes the factory's instructions.

DVT exists to break things deliberately:

- **Optical alignment survival** — fold the temples 500 times, is the image still
  centred in the eye? The combiner has to hold its angle in flexing plastic.
- **Module swap test** — the one that validates the whole service model. Give a
  unit and a spare module to **an actual local phone repair technician**, with
  the printed instructions and no special tools. Can they swap it and does the
  image land in alignment without calibration? If not, the service strategy is
  fiction and you need to know before you sell anything.
- Drop, sweat, humidity, thermal soak — assume monsoon and 40 °C
- Unit-to-unit consistency: does the image sit in the same place for all 30?

Certification samples come from this build.

---

## Phase 5 — Certification

**Months 9–12, parallel with DVT · ₹3–6 lakh**

Unchanged from the waveguide plan, and all of it is legally blocking.

| What | Note |
|---|---|
| **BIS CRS** | AR/VR/smart glasses are **explicitly named** in the Compulsory Registration Scheme. Per model, per brand. **3–5 weeks if you manufacture in India, 4–6 months if foreign.** |
| **WPC ETA** | For the BLE radio. ~₹10,000 fee + NABL lab testing. |
| **EPR** | E-waste producer registration. |

**Manufacture domestically.** That single choice can save six months.

---

## Phase 6 — First batch

**₹28–35 lakh for 100 units**

**Do not cut injection-mould tooling for 100 units.** 3–4 moulds × ₹3–8 lakh each
= ₹12–30 lakh, which at qty 100 is ₹12,000–30,000 *per unit*. SLS-print or CNC
the frames instead: ₹2,000–3,000/unit, zero tooling. Crossover is ~1,500–2,500
units.

One QC station is non-negotiable: **per-unit optical alignment check, every unit,
not a sample.**

---

## The money, honestly

| | |
|---|---|
| BOM at volume | ~$51–69 (₹4,800–6,600) |
| **True cost of your first 100 units** | **₹40,000–70,000 each** |
| Second batch of 500 | approaches the BOM |

The gap is one-time engineering and certification, and it is what kills hardware
projects. Our production doc has the full table: parts are only ₹26–30 lakh of a
₹52–78 lakh first run.

**Raise or pre-sell for the whole path to batch one, not to prototype.** The
classic death is ₹20 lakh spent, 30 beautiful working units in hand, and ₹30 lakh
needed to make 100 you can legally sell.

---

## What kills this build specifically

1. **Not legible in daylight.** Phase 0 answers it for ₹13,000 in week three.
2. **Daylight washout.** Even G1's 1000 nits reportedly dims outdoors. Ours is
   the same class of optics — test in real Indian sun in Phase 0, not after
   tooling.
3. **You buy a parallel-RGB panel.** Adds a video SoC, power draw and months.
   Ask about interface in the *first* email.
4. **Weight.** 45–60 g on one side of the face is asymmetric. Balance the battery
   into the opposite temple.
5. **Money runs out between DVT and PVT.** See above.

---

## What to do first

1. **Order an Even Realities G1 or Rokid Glasses** (~₹50,000). Real monochrome
   waveguide optics, in your hands in a week, running our Telugu frames. It
   answers the biggest question in the project.
2. **Email the optics shortlist** — Lingxi AR first, then Lochn, Crystal Optech,
   JBD. Price at 100/1,000/5,000/20,000, MOQ, engine included or separate,
   **SPI vs parallel.** Text is in [BOM.md](BOM.md).
3. **Start the Pvt Ltd + IEC paperwork.** Slow, blocking, and you legally cannot
   import the optics without IEC.

Those three run in parallel and cost roughly ₹1 lakh combined. Everything else
waits on their answers — particularly the price, which the email decides and
nothing else can.
