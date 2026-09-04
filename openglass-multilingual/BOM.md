# Bill of materials — lowest viable build

Monocular · monochrome green waveguide · phone-tethered · no camera.

Three volume columns because the answer genuinely differs by an order of
magnitude, and quoting one number without the quantity attached is how people
get misled. **Confidence is marked on every line** — I have moved these numbers
several times as better sources appeared, so you should be able to see which
ones rest on a published price and which are my judgement.

| Legend | Meaning |
|---|---|
| **S** | Sourced — a published price we found |
| **T** | Triangulated — inferred from teardown arithmetic or industry cost data |
| **E** | Estimated — my judgement from comparable parts |

---

## 1 · Sleek design — frame, temples, hinges

The part people actually touch, and the reason it reads as eyewear rather than
equipment.

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| Frame front + temples, TR90 injection moulded | $28.00 | $2.60 | $1.90 | E |
| Metal hinges ×2 | — incl. | $0.60 | $0.45 | E |
| Nose pads, temple tips | — incl. | $0.30 | $0.20 | E |
| **Subtotal** | **$28.00** | **$3.50** | **$2.55** | |

At 100 units you SLS-print or CNC the frames — ~$28 each and **zero tooling**.
Injection moulds are 3–4 cavities at ₹3–8 lakh each; that only pays back above
roughly 2,000 units. TR90 is what Rokid uses for temples: cheap, light, takes
colour, survives being sat on.

---

## 2 · Audio intake — microphone

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| MEMS microphone, I²S digital ×1 | $1.60 | $0.70 | $0.45 | S |
| **Subtotal** | **$1.60** | **$0.70** | **$0.45** | |

**One mic, not an array.** A two-mic beamforming array would help in a noisy
field, but it doubles the part, needs a DSP path, and costs more than the whole
audio-out subsystem. Digital I²S rather than analogue avoids needing a separate
codec chip.

---

## 3 · The projectable lens — the waveguide

This and §4 are the product. Everything else is commodity.

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| Waveguide, monochrome single-layer, resin, ~20–25° FOV | $120.00 | $25.00 | $15.00 | T |
| **Subtotal** | **$120.00** | **$25.00** | **$15.00** | |

Industry data puts a commercial-grade AR waveguide at **$80–350 (2025)**,
diffractive-via-nanoimprint at the low end, trending to **$60–120 by 2028**.
Named cost drivers: multi-layer colour stack yield, glass substrate quality,
grating replication tooling, edge coupler.

**We avoid the two biggest ones:**

- **Monochrome = one layer.** Full colour needs two or three stacked layers, and
  the assembly yield of that stack is a named driver. Green-only text needs one.
- **Resin, not glass.** Injection-moulded and roll-to-roll nanoimprint resin
  waveguides are in production now. No specialty high-index glass.
- **20–25° FOV**, not 50° — lower-index resin works, better yield.

Ours is the simplest waveguide that can exist, which is why I place it at or
below the bottom of the published band.

---

## 4 · The projector — light engine

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| Monochrome green micro-LED light engine | $140.00 | $30.00 | $20.00 | T |
| Display driver / timing controller | $9.00 | $4.00 | $2.50 | E |
| **Subtotal** | **$149.00** | **$34.00** | **$22.50** | |

JBD is the supplier behind G1 and RayNeo. Their published Hummingbird engines
draw **~150 mW typical** — that number matters for §6.

Triangulation: Rokid Glasses retails **$499** with *two* monochrome waveguide
engines, a Qualcomm AR1 and a 12MP camera. Meta Ray-Ban is **$299** with the same
class of SoC and camera and **no display**. That $200 retail delta for two
complete engines implies roughly **$40–50 per eye** at Rokid volume — which
brackets §3 + §4 together and lands where these two lines add up.

Some engines integrate the driver. **Ask** — it removes a line item.

---

## 5 · Audio output — speaker

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| Micro-speaker, open-ear, ×1 | $1.80 | $0.80 | $0.55 | E |
| **Subtotal** | **$1.80** | **$0.80** | **$0.55** | |

**Micro-speaker, not bone conduction.** Bone conduction is the nicer part — ears
stay open, better in wind — but it is ~$2.50 against ~$0.80. At a target this
tight it does not survive. A small driver aimed down at the ear from the temple
gets most of the benefit.

Keep bone conduction on the list for a premium variant.

---

## 6 · Charging electronics + power

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| LiPo cell, 250 mAh | $2.40 | $1.40 | $1.00 | E |
| Charge IC (TP4056-class) | $0.35 | $0.15 | $0.09 | S |
| Protection IC + FET | $0.30 | $0.15 | $0.10 | E |
| USB-C receptacle | $0.45 | $0.20 | $0.12 | E |
| Regulators for the engine's rails | $2.20 | $1.20 | $0.80 | E |
| **Subtotal** | **$5.70** | **$3.10** | **$2.11** | |

### Why 250 mAh is enough

| Draw | |
|---|---|
| ESP32-C3, BLE duty-cycled | ~20 mA avg |
| Light engine @150 mW, ~5% duty | ~4 mA avg |
| Mic + regulator overhead | ~4 mA |
| **Total** | **~28 mA** |

250 mAh ÷ 28 mA ≈ **8–9 hours** of intermittent use. The display is only lit
while text is on screen — a few seconds per interaction, not continuously. That
duty cycle is what keeps the battery (and therefore the weight and the cost)
small.

Charge from any phone charger. No proprietary cable, no dock.

---

## 7 · Everything else

| Item | @100 | @10k | @100k | Conf |
|---|---|---|---|---|
| **ESP32-C3** module (BLE 5, RISC-V) | $2.40 | $1.40 | $1.00 | S |
| PCB, 4-layer, small | $4.50 | $2.00 | $1.20 | E |
| Flex cable into temple | $1.60 | $0.70 | $0.45 | E |
| Passives, connectors | $1.10 | $0.50 | $0.35 | E |
| Button | $0.20 | $0.10 | $0.06 | E |
| Assembly + test labour | $9.00 | $4.00 | $2.50 | E |
| **Subtotal** | **$18.80** | **$8.70** | **$5.56** | |

**ESP32-C3, not S3.** The S3 was in earlier drafts for its PSRAM. It isn't
needed: the framebuffer is 640 × 200 ÷ 8 = **16,000 bytes**, which fits
comfortably in the C3's ~400 KB of SRAM. The C3 has BLE 5 and enough compute to
reassemble packets, RLE-decode and blit over SPI — which is all the firmware
does. Saves ~$0.80 and some board area.

Antenna is a PCB trace. Free.

---

## Totals

| | @100 | @10k | @100k |
|---|---|---|---|
| 1 · Frame | $28.00 | $3.50 | $2.55 |
| 2 · Microphone | $1.60 | $0.70 | $0.45 |
| 3 · Waveguide | $120.00 | $25.00 | $15.00 |
| 4 · Light engine + driver | $149.00 | $34.00 | $22.50 |
| 5 · Speaker | $1.80 | $0.80 | $0.55 |
| 6 · Power + charging | $5.70 | $3.10 | $2.11 |
| 7 · Everything else | $18.80 | $8.70 | $5.56 |
| **BOM** | **$324.90** | **$75.80** | **$48.72** |
| **In rupees** | **₹30,900** | **₹7,200** | **₹4,630** |

**Optics (§3 + §4) are 83% / 78% / 77% of the BOM** at 100 / 10k / 100k. That
dominance has held through every version of this analysis. Everything else —
the MCU, mic, speaker, battery, charging, PCB, frame and assembly *combined* —
is $56 / $17 / $11.

Which is the whole story in one line: **you are not building an electronics
product with some optics in it. You are buying optics and adding $17 of
electronics.**

### What that means at retail

| | @10k BOM | @100k BOM |
|---|---|---|
| At cost | ₹7,200 | ₹4,630 |
| Lean direct-to-consumer (1.3×) | **₹9,400** | **₹6,000** |
| Normal retail margin (2×) | ₹14,400 | ₹9,300 |

---

## What I cut, and what I refused to

**Cut:** camera · IMU · ambient light sensor · second display (monocular) ·
onboard app processor (phone-tethered) · bone conduction (→ micro-speaker) ·
mic array (→ one mic) · ESP32-S3 (→ C3) · PSRAM · colour (→ green only) ·
wide FOV (→ 20–25°) · glass substrate (→ resin).

**Refused to cut:**

- **Metal hinges.** It is eyewear. It gets folded twice a day for years, and the
  optics have to still be aligned afterwards.
- **Per-unit optical alignment QC.** Every unit, not a sample. A misaligned
  waveguide is an unusable device that looks fine on a bench.
- **A real frame.** The moment it looks like equipment rather than glasses,
  nobody wears it.
- **A connector on the optical engine.** See below — this one is not negotiable.

---

## Hard requirement: the optical engine is a replaceable module

**The optical engine (§3 + §4) MUST connect to the mainboard through a
connector, and MUST be removable without destroying the frame.** Not bonded,
not potted, not glued into the temple.

This is a commercial requirement wearing engineering clothes, and it has to be
locked before any mechanical design starts, because you cannot retrofit it.

### Why

**It is 78% of the BOM.** When the expensive part fails, "replace the device"
means eating $76. "Replace the module" means eating $59 — but more importantly
it means somebody *can*.

**We cannot afford service centres.** The only affordable service model is that
a local phone repair shop — and every town in India has one — can open the
device, swap a module, and close it. That is only possible if the design permits
it and the part is sourceable, which is what publishing the design actually buys
us commercially.

**It is the one thing our competitors structurally cannot copy.** Even Realities'
own documentation warns that accessing the internals requires *"destructive
disassembly"*, and their customers report warranty claims being reclassified as
"human damage." That is not malice, it is arithmetic: when repair is impossible,
denial is the only economics that works. Meta will never authorise a
neighbourhood repair shop to open a Ray-Ban Display.

### What this constrains

| Constraint | Consequence |
|---|---|
| Board-to-board or FPC connector on the engine | +$0.30–0.60 per unit |
| Temple opens with screws, not ultrasonic welding or glue | Slightly thicker temple |
| Optical alignment via a **mechanical datum**, not adhesive | The module drops into a machined seat and is located by it |
| Alignment must be repeatable **without instruments** | A repair shop has no optical bench |

That last row is the real engineering work: the seat has to hold the engine to
alignment tolerance by geometry alone, so that a swapped module lands correctly
with no calibration step. Design the datum first; everything else follows.

### What it costs

Roughly **$0.50–1.00 per unit** in connector and fastener, and some thickness.
Against the alternative — an unserviceable product at ₹9,000+, in a market that
demands service and where we cannot build a service network — it is the cheapest
insurance in the whole BOM.

---

## The honest caveats

**1. This is not your first-batch cost.** Your first 100 units cost
**₹40,000–70,000 each** all-in, because one-time engineering and certification
dominate — ₹52–78 lakh for a run of 100, of which parts are only ₹26–30 lakh.
The BOM above is what the *second and third* batches approach.

**2. The two lines that matter are triangulated, not quoted.** §3 and §4 are 78%
of the cost and neither is a supplier quote. The variance inside them is the
difference between a ₹6,000 device and a ₹14,000 one.

**3. One email closes it.** To Lingxi AR (they explicitly make monochrome and
optimise for cost, Sunny Optical–backed), Lochn Optics, Crystal Optech and JBD:

> Monocular smart glasses for the Indian market. Requirement: **monochrome green,
> single-layer, ~20–25° FOV, resin substrate, text only — no colour, no video.**
> Please quote unit price at **100 / 1,000 / 5,000 / 20,000**, MOQ, lead time,
> whether the light engine is included or separate, and whether the driver/TCON
> is integrated. Software and display rendering are complete; we are selecting
> optics.

Everything else in this document is commodity parts whose prices I can defend.
That one reply decides the product.
