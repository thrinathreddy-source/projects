import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
// Use custom domain once themayatara.com is purchased and verified in Resend.
// Until then: onboarding@resend.dev works on free tier for testing — note it
// only delivers to the Resend account owner's own address, not to real users.
if (!process.env.EMAIL_FROM) {
  console.error(
    "[email] EMAIL_FROM is not set — falling back to Resend's sandbox sender, " +
    "which only delivers to the Resend account owner. Password resets and " +
    "grievance notifications will silently fail to reach real users until " +
    "EMAIL_FROM is set to a verified domain."
  );
}
const FROM = process.env.EMAIL_FROM || "The Mayatara <onboarding@resend.dev>";

// Base URL for links and images inside emails. Falls back to the live Vercel
// deployment so nothing points at a domain that doesn't resolve yet.
const SITE = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "https://www.themayatara.com"
).replace(/\/$/, "");

// Bare host, for the plain-text sign-offs (e.g. "themayatara.com").
const SITE_LABEL = SITE.replace(/^https?:\/\/(www\.)?/, "");

// Where grievances and cron alerts land. Note this is the Resend account
// owner's own address, which is why the contact form works on the free tier
// before any domain is verified — Resend will deliver to the account owner
// from onboarding@resend.dev, just not to anybody else.
if (!process.env.ADMIN_EMAIL) {
  console.error(
    "[email] ADMIN_EMAIL is not set — grievance, safety, and cron-alert " +
    "mail is falling back to a hardcoded personal address baked into source " +
    "control instead of a company-owned inbox. Set ADMIN_EMAIL."
  );
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "e87997699@gmail.com";

// Anything a user typed goes through this before it touches an HTML template.
// These mails are read in a mail client, which will happily render whatever
// markup it is handed.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Header values (Subject, etc.) must never contain a raw newline — CR/LF lets
// a crafted value inject extra headers (e.g. a fake Bcc) into the message.
// sanitise() in lib/security.ts only strips HTML/script patterns, not this.
function sanitiseHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendCronAlertEmail(error: string, matched: number, notified: number) {
  const ADMIN = ADMIN_EMAIL;
  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `⚠️ The Mayatara — Friday cron ${error ? "FAILED" : "completed"}`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { background:#1a1a1a; font-family:'Courier New',monospace; margin:0; padding:20px; color:#FAF0D7; }
  .wrap { max-width:520px; margin:0 auto; background:#2a1a1a; border:2px solid ${error ? "#FF4444" : "#C4A45A"}; padding:28px; }
  h2 { color:${error ? "#FF4444" : "#C4A45A"}; margin:0 0 16px; font-size:16px; letter-spacing:3px; }
  pre { background:#111; padding:12px; font-size:11px; color:#FF8888; overflow-wrap:break-word; white-space:pre-wrap; }
  .stat { color:#E8D5A8; font-size:13px; margin:6px 0; }
</style></head><body>
  <div class="wrap">
    <h2>${error ? "⚠ CRON FAILED" : "✓ CRON COMPLETED"} — ${new Date().toISOString()}</h2>
    <p class="stat">Matched: <strong>${matched}</strong> pairs</p>
    <p class="stat">No-match notified: <strong>${notified}</strong> users</p>
    ${error ? `<p style="color:#FF4444;margin-top:16px">Error:</p><pre>${error}</pre>` : ""}
    <p style="font-size:11px;color:#6B4C35;margin-top:20px">The Mayatara · Friday cron · ${SITE_LABEL}</p>
  </div>
</body></html>`,
  });
}

/**
 * Delivers a contact-page submission to the admin inbox.
 *
 * replyTo is set to the sender's address so a grievance can be answered by
 * hitting reply — the IT Rules 2021 clock (acknowledge in 24h, resolve in 15
 * days) starts when this arrives, so the reply path needs to be zero-friction.
 */
export async function sendGrievanceEmail(input: {
  category: string;
  name: string;
  email: string;
  message: string;
  userId?: string | null;
  reference: string;
}) {
  const { category, name, email, message, userId, reference } = input;

  // Three tiers, so the subject line alone tells you whether to stop what
  // you're doing. The red siren is reserved for the two categories that carry
  // a real obligation and a real person waiting — if everything got one, it
  // would stop meaning anything.
  const SIREN = { level: "siren", icon: "🚨", label: "REAL PROBLEM", colour: "#8B1A1A" };
  const NOTICE = { level: "notice", icon: "⚠️", label: "NEEDS ACTION", colour: "#C4761A" };
  const ROUTINE = { level: "routine", icon: "", label: "FOR INFO", colour: "#C4A45A" };

  const TIER: Record<string, typeof SIREN> = {
    "Report abuse or a safety concern": SIREN,   // 24h to acknowledge
    "Grievance or complaint":           SIREN,   // 24h to acknowledge, 15d to resolve
    "Delete my account":               NOTICE,   // 15d to action
    "Correct or export my data":       NOTICE,   // 15d to action
  };
  const tier = TIER[category] ?? ROUTINE;
  const urgent = tier.level === "siren";

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    replyTo: email,
    subject: `${tier.icon ? tier.icon + " " : ""}[Mayatara] ${sanitiseHeaderValue(category)} — ${sanitiseHeaderValue(name || email)}`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { background:#F2E4C4; font-family:'Courier New',monospace; margin:0; padding:20px; }
  .wrap { max-width:560px; margin:0 auto; background:#FAF0D7; border:2px solid ${tier.colour}; box-shadow:5px 5px 0 ${tier.colour}; }
  .header { background:${tier.colour}; padding:20px 28px; }
  .header h1 { color:#FAF0D7; font-size:14px; letter-spacing:3px; margin:0; }
  .siren { background:#8B1A1A; color:#FAF0D7; padding:14px 28px; font-size:13px; font-weight:bold; letter-spacing:1px; }
  .body { padding:24px 28px; color:#2C1810; font-size:13px; line-height:1.7; }
  .row { margin:0 0 8px; }
  .k { color:#6B4C35; font-size:11px; letter-spacing:1px; }
  .msg { background:#F2E4C4; border-left:3px solid #C4A45A; padding:14px; margin-top:16px; white-space:pre-wrap; word-break:break-word; }
  .foot { color:#6B4C35; font-size:11px; margin-top:20px; padding-top:14px; border-top:1px solid #C4A45A; }
</style></head><body>
  <div class="wrap">
    <div class="header"><h1>${tier.icon ? tier.icon + " " : ""}${tier.label}</h1></div>
    ${urgent ? `<div class="siren">🚨 This one is real. Acknowledge within 24 hours.</div>` : ""}
    <div class="body">
      <p class="row"><span class="k">CATEGORY</span><br>${escapeHtml(category)}</p>
      <p class="row"><span class="k">FROM</span><br>${escapeHtml(name || "(not given)")} &lt;${escapeHtml(email)}&gt;</p>
      <p class="row"><span class="k">ACCOUNT</span><br>${userId ? escapeHtml(userId) : "not signed in"}</p>
      <p class="row"><span class="k">REFERENCE</span><br>${escapeHtml(reference)}</p>
      <div class="msg">${escapeHtml(message)}</div>
      <div class="foot">
        Reply directly to this email to reach them.<br>
        ${urgent ? "Clock started when this arrived: acknowledge in 24 hours, resolve in 15 days.<br>" : ""}
        ${tier.level === "notice" ? "Action this within 15 days of confirming it's their account.<br>" : ""}
        The Mayatara · ${SITE_LABEL}
      </div>
    </div>
  </div>
</body></html>`,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetLink: string) {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Reset your Mayatara password",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { background: #F2E4C4; font-family: 'Courier New', monospace; margin: 0; }
  .wrap { max-width: 520px; margin: 40px auto; background: #FAF0D7; border: 2px solid #C4A45A; box-shadow: 5px 5px 0 #C4A45A; }
  .header { background: #8B1A1A; padding: 28px 36px; }
  .header h1 { color: #FAF0D7; font-size: 22px; letter-spacing: 4px; margin: 0; }
  .body { padding: 32px 36px; color: #2C1810; font-size: 13px; line-height: 1.8; }
  .sign { color: #6B4C35; font-size: 11px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #C4A45A; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>THE MAYATARA</h1></div>
    <div class="body">
      <p>Someone asked to reset the password for this email address.</p>
      <p>If that was you, set a new one here. The link works once and expires in an hour.</p>
      <div style="margin:24px 0;text-align:center">
        <a href="${resetLink}" style="display:inline-block;background:#8B1A1A;color:#FAF0D7;font-family:'Courier New',monospace;font-size:12px;letter-spacing:3px;padding:14px 28px;text-decoration:none;">
          SET A NEW PASSWORD
        </a>
      </div>
      <p style="font-size:11px;color:#6B4C35">If it wasn't you, ignore this email — nothing changes and your password stays as it is.</p>
      <div class="sign">The Mayatara · ${SITE_LABEL}</div>
    </div>
  </div>
</body>
</html>`,
  });
}
