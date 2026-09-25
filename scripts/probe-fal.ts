/**
 * Verify every fal endpoint we depend on actually exists — `npm run probe:fal`.
 *
 * Needs no API key and costs nothing. fal's queue answers an unauthenticated
 * POST with 401 when the endpoint exists and 404 when it does not, so the status
 * code alone distinguishes "real endpoint" from "renamed or retired". Two
 * controls are included on every run, because a probe whose method has silently
 * broken is worse than no probe.
 *
 * Run this after any vendor announcement. A stale endpoint id fails only at
 * dispatch — after the user has been charged and the job has been queued.
 */

const QUEUE = "https://queue.fal.run";

type Probe = { id: string; role: string };

const PROBES: Probe[] = [
  { id: process.env.FAL_STILL_MODEL || "fal-ai/lora", role: "still · checkpoint runner" },
  { id: "fal-ai/fast-sdxl", role: "still · plain SDXL fallback" },
  {
    id: process.env.FAL_PREVIEW_MODEL || "fal-ai/wan/v2.6/text-to-video",
    role: "motion · standard, text-to-video",
  },
  {
    id: process.env.FAL_PREVIEW_I2V_MODEL || "fal-ai/wan/v2.6/image-to-video",
    role: "motion · standard, image-to-video",
  },
  {
    id: process.env.FAL_FINAL_MODEL || "fal-ai/kling-video/v3/standard/text-to-video",
    role: "motion · master, text-to-video",
  },
  {
    id:
      process.env.FAL_FINAL_I2V_MODEL ||
      "fal-ai/kling-video/v3/standard/image-to-video",
    role: "motion · master, image-to-video",
  },
];

const CONTROLS: Probe[] = [
  { id: "fal-ai/flux/dev", role: "control · must exist" },
  { id: "fal-ai/arka-not-a-real-model", role: "control · must not exist" },
];

async function statusOf(id: string): Promise<number> {
  try {
    const res = await fetch(`${QUEUE}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

function verdict(status: number): { ok: boolean; label: string } {
  if (status === 401 || status === 403) return { ok: true, label: "exists" };
  if (status === 404) return { ok: false, label: "NOT FOUND" };
  if (status === 0) return { ok: false, label: "unreachable" };
  return { ok: false, label: `unexpected ${status}` };
}

async function main() {
  console.log("\nProbing fal endpoints — no key required, no cost.\n");

  let failures = 0;

  for (const probe of PROBES) {
    const { ok, label } = verdict(await statusOf(probe.id));
    if (!ok) failures += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${probe.id.padEnd(50)} ${probe.role}`);
    if (!ok) console.log(`       ${label} — update the id in src/lib/providers/`);
  }

  console.log("\n  Method check:\n");
  const positive = verdict(await statusOf(CONTROLS[0].id));
  const negative = verdict(await statusOf(CONTROLS[1].id));
  const methodSound = positive.ok && !negative.ok;

  console.log(`  ${positive.ok ? "ok  " : "FAIL"} known-good endpoint reads as "exists"`);
  console.log(`  ${!negative.ok ? "ok  " : "FAIL"} known-fake endpoint reads as "missing"`);

  if (!methodSound) {
    console.log(
      "\n  The probe itself is unreliable right now — fal may have changed how it\n" +
        "  answers unauthenticated requests. Treat the results above as unproven.",
    );
    process.exit(2);
  }

  console.log(
    failures === 0
      ? "\n  All endpoints resolve.\n"
      : `\n  ${failures} endpoint(s) need fixing before any render will work.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
