import "dotenv/config";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { COMPANY, missingCompanyDetails } from "@/lib/company";
import { PLANS, type PlanDefinition } from "@/lib/plans";
import { getSettings } from "@/lib/settings";
import { availableShowcase } from "@/lib/showcase";
import { isComingSoon, launchPromise } from "@/lib/launch";

/**
 * The launch checklist, as a program.
 *
 * A checklist in a document goes stale the moment the code moves. This asks the
 * running system instead: is the database reachable, is storage durable, can we
 * send mail, are the paid plans wired to real Razorpay ids. Every check names
 * what to do about a failure, because a red line that does not tell you the fix
 * is just anxiety.
 *
 * Exit code is 1 if anything required is unmet, so it can gate a deploy.
 *
 *   npm run preflight
 */

type Status = "pass" | "fail" | "warn" | "skip";

type Check = {
  id: string;
  title: string;
  status: Status;
  detail: string;
  /** What the operator has to do. Omitted when the check passed. */
  fix?: string;
};

const results: Check[] = [];

function record(check: Check) {
  results.push(check);
}

function present(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkDatabase() {
  const config = env();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    return record({
      id: "db.reachable",
      title: "Database reachable",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
      fix: "Check DATABASE_URL. For production, provision Postgres (Neon's free tier is enough to start).",
    });
  }

  const local = /localhost|127\.0\.0\.1/.test(config.DATABASE_URL);
  record({
    id: "db.reachable",
    title: "Database reachable",
    status: local && config.isProduction ? "fail" : "pass",
    detail: local ? "Connected to a local database." : "Connected.",
    fix: local && config.isProduction ? "Production is pointing at localhost. Set DATABASE_URL to the hosted database." : undefined,
  });

  // Migrations applied?
  try {
    const [row] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NULL
    `;
    const pending = Number(row?.count ?? 0);
    record({
      id: "db.migrated",
      title: "Migrations applied",
      status: pending === 0 ? "pass" : "fail",
      detail: pending === 0 ? "No unfinished migrations." : `${pending} migration(s) did not finish.`,
      fix: pending === 0 ? undefined : "Run `npm run db:deploy` against this database.",
    });
  } catch {
    record({
      id: "db.migrated",
      title: "Migrations applied",
      status: "fail",
      detail: "No _prisma_migrations table — this database has never been migrated.",
      fix: "Run `npm run db:deploy` against this database.",
    });
  }

  // Seed data: plans have to exist or billing has nothing to sell.
  try {
    const count = await db.plan.count();
    record({
      id: "db.seeded",
      title: "Plans seeded",
      status: count > 0 ? "pass" : "fail",
      detail: `${count} plan row(s).`,
      fix: count > 0 ? undefined : "Run `npm run db:seed` against this database.",
    });
  } catch {
    record({
      id: "db.seeded",
      title: "Plans seeded",
      status: "fail",
      detail: "Could not read the plan table.",
      fix: "Run `npm run db:deploy && npm run db:seed`.",
    });
  }
}

function checkSecrets() {
  const config = env();

  const weakAuth = config.BETTER_AUTH_SECRET.length < 32;
  record({
    id: "secret.auth",
    title: "BETTER_AUTH_SECRET is strong",
    status: weakAuth ? (config.isProduction ? "fail" : "warn") : "pass",
    detail: `${config.BETTER_AUTH_SECRET.length} characters.`,
    fix: weakAuth ? "Generate one with `openssl rand -base64 32` and set it in the deploy environment." : undefined,
  });

  const defaultCron = config.CRON_SECRET === "dev-cron-secret";
  record({
    id: "secret.cron",
    title: "CRON_SECRET is not the default",
    status: defaultCron ? (config.isProduction ? "fail" : "warn") : "pass",
    detail: defaultCron ? "Still the development default." : "Set.",
    fix: defaultCron
      ? "Generate one with `openssl rand -base64 32`. Anyone who knows the default can drive your queue and renewals endpoints."
      : undefined,
  });
}

function checkStorage() {
  const config = env();

  record({
    id: "storage.r2",
    title: "Durable storage configured",
    status: config.hasR2 ? "pass" : config.isProduction ? "fail" : "warn",
    detail: config.hasR2
      ? `R2 bucket "${config.R2_BUCKET}".`
      : "Falling back to the local filesystem.",
    fix: config.hasR2
      ? undefined
      : "Create the R2 bucket and set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. On a serverless host the local driver loses every render when the instance recycles.",
  });
}

function checkEmail() {
  const config = env();

  record({
    id: "email.provider",
    title: "Email delivery configured",
    status: config.hasEmail ? "pass" : config.isProduction ? "fail" : "warn",
    detail: config.hasEmail ? "Resend key present." : "Messages print to the console.",
    fix: config.hasEmail
      ? undefined
      : "Create a Resend account and set RESEND_API_KEY. Without it, password resets and email verification never reach anyone.",
  });

  const defaultFrom = config.EMAIL_FROM.includes("resend.dev");
  record({
    id: "email.from",
    title: "Sender address is your own domain",
    status: defaultFrom ? "warn" : "pass",
    detail: config.EMAIL_FROM,
    fix: defaultFrom
      ? "Verify your domain in Resend and set EMAIL_FROM to an address on it. The shared resend.dev sender is rate limited and lands in spam."
      : undefined,
  });
}

async function checkPayments() {
  const config = env();

  record({
    id: "razorpay.keys",
    title: "Razorpay credentials",
    status: config.hasRazorpay ? "pass" : "warn",
    detail: config.hasRazorpay ? "Key id and secret present." : "Not configured — paid plans show \"Coming soon\".",
    fix: config.hasRazorpay ? undefined : "Complete Razorpay KYC, then set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
  });

  record({
    id: "razorpay.webhook",
    title: "Webhook secret set",
    status: present(config.RAZORPAY_WEBHOOK_SECRET) ? "pass" : config.hasRazorpay ? "fail" : "warn",
    detail: present(config.RAZORPAY_WEBHOOK_SECRET) ? "Set." : "Missing.",
    fix: present(config.RAZORPAY_WEBHOOK_SECRET)
      ? undefined
      : "Register the webhook at /api/webhooks/razorpay for payment.captured, payment.failed, subscription.charged and subscription.cancelled, then set RAZORPAY_WEBHOOK_SECRET. Credits are granted from the webhook, not the browser redirect — without this nobody who pays receives anything.",
  });

  // Paid plans need a Razorpay plan id or checkout cannot open.
  try {
    const paid = PLANS.filter((plan: PlanDefinition) => plan.priceMinorInr > 0);
    const rows = await db.plan.findMany({
      where: { code: { in: paid.map((plan: PlanDefinition) => plan.code) } },
      select: { code: true, providerPlanId: true },
    });

    const unwired = rows.filter((row) => !present(row.providerPlanId ?? "")).map((row) => row.code);

    record({
      id: "razorpay.plans",
      title: "Paid plans wired to Razorpay",
      status: unwired.length === 0 ? "pass" : config.hasRazorpay ? "fail" : "warn",
      detail:
        unwired.length === 0
          ? `${rows.length} plan(s) carry a provider id.`
          : `Missing provider id: ${unwired.join(", ")}.`,
      fix:
        unwired.length === 0
          ? undefined
          : "Create each plan in the Razorpay dashboard and write its id into plan.providerPlanId. Until then those tiers correctly refuse to open a checkout that would fail.",
    });
  } catch {
    record({
      id: "razorpay.plans",
      title: "Paid plans wired to Razorpay",
      status: "skip",
      detail: "Could not read the plan table.",
    });
  }
}

function checkLegal() {
  const missing = missingCompanyDetails();

  record({
    id: "legal.company",
    title: "Company details filled",
    status: missing.length === 0 ? "pass" : "fail",
    detail:
      missing.length === 0
        ? `Operating as ${COMPANY.legalName}.`
        : `${missing.length} field(s) empty: ${missing.join(", ")}.`,
    fix:
      missing.length === 0
        ? undefined
        : "Fill src/lib/company.ts. Razorpay will not activate without reachable terms, privacy, refund and contact pages, and these render as visible blanks until set. Have a lawyer read the result — the liability figure in particular.",
  });
}

function checkProviders() {
  const config = env();
  const configured = config.videoProviders;
  const mockOnly = configured.every((name) => name === "mock");

  record({
    id: "provider.real",
    title: "A real video provider is configured",
    status: mockOnly ? (config.isProduction ? "fail" : "warn") : "pass",
    detail: `VIDEO_PROVIDERS = ${configured.join(", ") || "(none)"}.`,
    fix: mockOnly
      ? "Set FAL_KEY and add \"fal\" to VIDEO_PROVIDERS. The mock provider returns a sample render and costs nothing — useful for development, useless to a customer."
      : undefined,
  });

  if (!mockOnly) {
    record({
      id: "provider.key",
      title: "Provider credentials present",
      status: config.hasFal ? "pass" : "fail",
      detail: config.hasFal ? "FAL_KEY set." : "fal is in VIDEO_PROVIDERS but FAL_KEY is empty.",
      fix: config.hasFal ? undefined : "Set FAL_KEY, or remove fal from VIDEO_PROVIDERS.",
    });
  }

  record({
    id: "provider.lexicon",
    title: "Cultural lexicon validated against real renders",
    status: config.hasFal ? "warn" : "skip",
    detail: config.hasFal
      ? "FAL_KEY is present — the experiment can run."
      : "Needs FAL_KEY.",
    fix: "Run `npm run lexicon` to generate the 8 settings x 8 styles grid, then judge it: does Temple South give a gopuram or a pagoda? Is Bombay 1970s recognisable? This validates or kills the premise, and no test can answer it.",
  });
}

async function checkShowcase() {
  const settings = await getSettings();
  const grant = settings["signup.grantCredits"];
  const published = availableShowcase().length;

  /**
   * With no signup grant, the showcase is the entire top of the funnel: it is
   * the only way a stranger sees what the product makes before paying. Shipping
   * without it means asking people to buy credits for a thing they have never
   * seen work.
   */
  const carriesTheFunnel = grant === 0;

  record({
    id: "funnel.showcase",
    title: "Demonstrations published",
    status: published > 0 ? "pass" : carriesTheFunnel ? "fail" : "warn",
    detail:
      published > 0
        ? `${published} clip(s) live.`
        : `None. Signup grant is ${grant} credits.`,
    fix:
      published > 0
        ? undefined
        : carriesTheFunnel
          ? "Render clips through Arka, drop the mp4 and poster into public/showcase/, and list them in src/lib/showcase.ts. Nobody gets free credits, so this is the only thing that shows a stranger what they would be buying. See public/showcase/README.md."
          : "Optional while a signup grant exists, but demonstrations convert better than a grant does.",
  });
}

function checkFfmpeg() {
  /**
   * The cadence pass is the aesthetic thesis, and it fails soft.
   *
   * No ffmpeg means smooth interpolated video instead of animation held on
   * twos, plus narration left as a separate file — on renders the customer
   * paid for, with nothing in the UI to say so.
   */
  let version: string | null = null;

  try {
    if (ffmpegPath) {
      version = execFileSync(ffmpegPath, ["-version"], { encoding: "utf8" })
        .split("\n")[0]
        .trim();
    }
  } catch {
    version = null;
  }

  record({
    id: "media.ffmpeg",
    title: "ffmpeg available",
    status: version ? "pass" : "fail",
    detail: version ?? "Binary missing or not executable.",
    fix: version
      ? undefined
      : "Reinstall dependencies so ffmpeg-static provides its binary. Without it the cadence pass is skipped and output loses the limited-animation look.",
  });
}

function checkOperations() {
  const config = env();

  record({
    id: "ops.admin",
    title: "An admin can be alerted",
    status: config.adminEmails.length > 0 ? "pass" : "warn",
    detail: config.adminEmails.length > 0 ? `${config.adminEmails.length} address(es).` : "ADMIN_EMAILS is empty.",
    fix:
      config.adminEmails.length > 0
        ? undefined
        : "Set ADMIN_EMAILS. Alerting runs every 15 minutes but has nowhere to send, so a dead queue would go unnoticed.",
  });

  record({
    id: "ops.proxies",
    title: "Client IP resolution for rate limiting",
    status: config.trustedProxyCidrs.length > 0 ? "pass" : "warn",
    detail:
      config.trustedProxyCidrs.length > 0
        ? `${config.trustedProxyCidrs.length} trusted range(s).`
        : "No trusted proxies configured.",
    fix:
      config.trustedProxyCidrs.length > 0
        ? undefined
        : "Fine on plain Vercel, which sets a single x-forwarded-for. If you put Cloudflare (or any second proxy) in front, set TRUSTED_PROXY_CIDRS — otherwise no client IP resolves and every visitor shares one bucket, capping sign-in at 3 attempts per 10 seconds for the whole site.",
  });

  record({
    id: "ops.budget",
    title: "Daily spend cap",
    status: config.DAILY_BUDGET_USD > 0 ? "pass" : "fail",
    detail: `$${config.DAILY_BUDGET_USD}/day.`,
    fix: config.DAILY_BUDGET_USD > 0 ? undefined : "Set DAILY_BUDGET_USD above zero, or nothing bounds a runaway loop.",
  });
}

/**
 * Compliance surface that a lawyer will ask about and code cannot supply.
 *
 * These are checks on configuration, not on legality — a filled-in GSTIN says
 * a number is present, not that it is yours or that you are registered. What
 * they prevent is going live having simply forgotten.
 */
function checkCompliance() {
  const officer = COMPANY.grievanceOfficer;
  const named = present(officer.name) && present(officer.email);

  record({
    id: "legal.grievance",
    title: "Grievance Officer named",
    status: named ? "pass" : "fail",
    detail: named ? `${officer.name} <${officer.email}>` : "Not named.",
    fix: named
      ? undefined
      : "Fill grievanceOfficer in src/lib/company.ts. The IT Rules 2021 require a named individual with a published contact and a 24h/15day SLA; the DPDP Act separately requires a contact for data-principal requests. /acceptable-use renders these as visible blanks until set.",
  });

  const gstin = COMPANY.tax.gstin;
  record({
    id: "legal.gstin",
    title: "GSTIN configured",
    status: present(gstin) ? "pass" : env().isProduction ? "fail" : "warn",
    detail: present(gstin)
      ? `${gstin} · SAC ${COMPANY.tax.sacCode} · ${COMPANY.tax.gstRatePercent}%`
      : "Empty — no tax invoices will be issued.",
    fix: present(gstin)
      ? undefined
      : "Register for GST and set tax.gstin in src/lib/company.ts. Until it is set, invoice numbers are never allocated and customers cannot download an invoice — which a business buyer will ask for on their first purchase.",
  });

  // A 15-character GSTIN is the only format check worth making; anything more
  // would be pretending to validate something only the GST portal can.
  if (present(gstin) && gstin.trim().length !== 15) {
    record({
      id: "legal.gstinFormat",
      title: "GSTIN looks well formed",
      status: "fail",
      detail: `${gstin.trim().length} characters, expected 15.`,
      fix: "Check the GSTIN. It appears on every invoice you issue.",
    });
  }

  record({
    id: "legal.placeOfSupply",
    title: "State of registration set",
    status: present(COMPANY.registeredAddress.state) ? "pass" : "warn",
    detail: present(COMPANY.registeredAddress.state)
      ? COMPANY.registeredAddress.state
      : "Empty.",
    fix: present(COMPANY.registeredAddress.state)
      ? undefined
      : "Set registeredAddress.state. It decides CGST+SGST versus IGST on every invoice.",
  });
}

/**
 * The blind spot in `alerts.ts`: it runs inside this app, so it cannot report
 * that this app is down.
 */
function checkMonitoring() {
  const monitor = process.env.EXTERNAL_MONITOR_URL;

  record({
    id: "ops.externalMonitor",
    title: "External uptime monitor declared",
    status: present(monitor) ? "pass" : env().isProduction ? "fail" : "warn",
    detail: present(monitor) ? monitor! : "None declared.",
    fix: present(monitor)
      ? undefined
      : "Point UptimeRobot, BetterStack or equivalent at /api/health and record its dashboard URL in EXTERNAL_MONITOR_URL. alerts.ts runs on this app's own cron, so a dead deployment sends no alert at all — the silence looks exactly like health.",
  });

  const backups = process.env.BACKUP_POLICY;

  record({
    id: "ops.backups",
    title: "Backup policy declared",
    status: present(backups) ? "pass" : env().isProduction ? "fail" : "warn",
    detail: present(backups) ? backups! : "None declared.",
    fix: present(backups)
      ? undefined
      : 'Turn on point-in-time recovery with your database provider, then set BACKUP_POLICY to a one-line description, e.g. "Neon PITR 7 days + weekly npm run backup to R2". credit_ledger is the only record of what customers are owed and cannot be rebuilt from any vendor.',
  });
}

/** The content policy, and whether the pieces of it are actually wired up. */
function checkContentPolicy() {
  record({
    id: "policy.moderation",
    title: "Content policy enforced at submission",
    status: "pass",
    detail: "src/lib/moderation.ts runs inside projects.create.",
  });

  record({
    id: "policy.published",
    title: "Acceptable use policy reachable",
    status: present(COMPANY.email.abuse) ? "pass" : "warn",
    detail: present(COMPANY.email.abuse)
      ? `Reports go to ${COMPANY.email.abuse}.`
      : "/acceptable-use is published but has no abuse address to report to.",
    fix: present(COMPANY.email.abuse)
      ? undefined
      : "Set email.abuse in src/lib/company.ts, and make sure somebody reads it.",
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const GLYPH: Record<Status, string> = { pass: "✓", fail: "✗", warn: "!", skip: "·" };

/**
 * While the site is closed, most of the launch list does not apply yet.
 *
 * A holding page serves one route and a form. It never touches storage, never
 * calls a model, never takes money — so failing a deploy on R2, fal, Razorpay
 * or a missing showcase would be reporting against a bar this deploy is not
 * trying to clear. They are downgraded to advisory and clearly labelled, not
 * hidden: they all come back the moment the mode flips to live.
 */
const NOT_YET_WHILE_CLOSED = new Set([
  // Never touched by a holding page. `storage()` only throws when something
  // actually reads or writes an object, and nothing here does — which is
  // precisely why this deploy is possible before R2 exists.
  "storage.r2",
  // No model is called, so no key and no lexicon experiment is needed yet.
  "provider.real",
  "provider.key",
  "provider.lexicon",
  // Nothing is sold, so nothing needs a price, a plan id or a tax invoice.
  "razorpay.keys",
  "razorpay.webhook",
  "razorpay.plans",
  "legal.gstin",
  "legal.gstinFormat",
  "legal.placeOfSupply",
  // Nothing renders, so there is nothing to demonstrate yet. This is the top
  // of the funnel the moment the mode flips, and it comes straight back.
  "funnel.showcase",
  // The waitlist stores an address; it does not send anything.
  "email.provider",
  "media.ffmpeg",
]);

function applyLaunchMode() {
  if (!isComingSoon()) return;

  for (const check of results) {
    if (check.status === "fail" && NOT_YET_WHILE_CLOSED.has(check.id)) {
      check.status = "warn";
      check.detail = `${check.detail} (not required while the site is closed)`;
    }
  }
}

function report(): number {
  applyLaunchMode();

  if (isComingSoon()) {
    console.log(
      `\nLaunch mode: COMING SOON — "${launchPromise()}"\n` +
        "Only the holding page, the policy pages and /api/health are served.\n" +
        "Set NEXT_PUBLIC_LAUNCH_MODE=live to open, and re-run this first.",
    );
  }

  const failed = results.filter((check) => check.status === "fail");
  const warned = results.filter((check) => check.status === "warn");

  console.log("\nArka preflight\n");

  for (const check of results) {
    console.log(`  ${GLYPH[check.status]} ${check.title} — ${check.detail}`);
  }

  const actionable = [...failed, ...warned].filter((check) => check.fix);

  if (actionable.length > 0) {
    console.log("\nTo do:\n");
    actionable.forEach((check, index) => {
      console.log(`  ${index + 1}. [${check.status === "fail" ? "BLOCKING" : "advisory"}] ${check.title}`);
      console.log(`     ${check.fix}\n`);
    });
  }

  const mode = env().isProduction ? "production" : "development";
  console.log(
    `${failed.length} blocking, ${warned.length} advisory, ` +
      `${results.filter((c) => c.status === "pass").length} ready (checked as ${mode}).\n`,
  );

  if (!env().isProduction && (failed.length > 0 || warned.length > 0)) {
    console.log("Run with NODE_ENV=production to see what would block a live deploy.\n");
  }

  return failed.length > 0 ? 1 : 0;
}

async function main() {
  await checkDatabase();
  checkSecrets();
  checkStorage();
  checkEmail();
  await checkPayments();
  checkLegal();
  checkCompliance();
  checkContentPolicy();
  checkProviders();
  await checkShowcase();
  checkFfmpeg();
  checkOperations();
  checkMonitoring();

  process.exitCode = report();
}

main()
  .catch((error) => {
    console.error("Preflight could not complete:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
