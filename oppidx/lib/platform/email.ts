import { Resend } from "resend";
import { SITE_URL, DISPLAY_DOMAIN } from "@/lib/siteUrl";

// Lazily constructed — see lib/email.ts for why (Resend's constructor
// throws synchronously when RESEND_API_KEY is unset, which crashed
// `next build` for any environment missing it, not just at send time).
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
// Use oppidx.com once it's verified as a sending domain in Resend.
// Until then: onboarding@resend.dev works on free tier for testing.
const FROM = process.env.EMAIL_FROM || "OppIDX Match <onboarding@resend.dev>";
const LOGO_URL = `${SITE_URL}/logo.png`;

export async function sendMatchEmail(
  toEmail: string,
  userName: string,
  matchName: string,
  matchContact: string,
  contactType: string,
  matchReason: string
) {
  const contactLabel = contactType === "instagram" ? "Instagram" : contactType === "whatsapp" ? "WhatsApp" : "number";

  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: `Your Friday match is here — ${matchName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { background: #F2E4C4; font-family: 'Courier New', monospace; margin: 0; padding: 0; }
    .wrap { max-width: 520px; margin: 40px auto; background: #FAF0D7; border: 2px solid #C4A45A; box-shadow: 5px 5px 0 #C4A45A; }
    .header { background: #8B1A1A; padding: 28px 36px; }
    .header-inner { display: flex; align-items: center; gap: 14px; }
    .header h1 { color: #FAF0D7; font-size: 22px; letter-spacing: 4px; margin: 0; }
    .header p { color: #E8D5A8; font-size: 10px; letter-spacing: 2px; margin: 6px 0 0; }
    .body { padding: 32px 36px; }
    .name { font-size: 26px; color: #D4600A; letter-spacing: 2px; font-weight: bold; margin: 0 0 6px; }
    .reason { color: #6B4C35; font-size: 13px; line-height: 1.7; margin: 16px 0; padding: 16px; border-left: 3px solid #C4A45A; }
    .contact-box { background: #D4600A; padding: 20px 24px; margin: 24px 0; }
    .contact-label { color: #FAF0D7; font-size: 10px; letter-spacing: 3px; margin: 0 0 6px; }
    .contact-val { color: #FAF0D7; font-size: 22px; font-weight: bold; margin: 0; letter-spacing: 1px; }
    .sign { color: #6B4C35; font-size: 11px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #C4A45A; }
    .divider { color: #C4A45A; text-align: center; letter-spacing: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-inner">
        <img src="${LOGO_URL}" alt="OppIDX" width="72" height="72" style="object-fit:contain;display:block;" />
        <div>
          <h1>OPPIDX MATCH</h1>
          <p>YOUR FRIDAY MATCH</p>
        </div>
      </div>
    </div>
    <div class="body">
      <p style="color:#6B4C35;font-size:11px;letter-spacing:2px;margin:0 0 8px">MATCHED WITH</p>
      <p class="name">${matchName}</p>
      <div class="divider">◆ ✦ ◆</div>
      <div class="reason">${matchReason}</div>
      <div class="contact-box">
        <p class="contact-label">THEIR ${contactLabel.toUpperCase()}</p>
        <p class="contact-val">${matchContact}</p>
      </div>
      <p style="color:#2C1810;font-size:13px;line-height:1.7">
        That's it from us.<br>
        The rest is yours.
      </p>
      <div class="sign">
        OppIDX Match · For the real ones · ${DISPLAY_DOMAIN}<br>
              </div>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendNoMatchEmail(toEmail: string, userName: string) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: "No match this Friday — we're still looking",
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
    <div class="header">
      <div class="header-inner">
        <img src="${LOGO_URL}" alt="OppIDX" width="72" height="72" style="object-fit:contain;display:block;" />
        <h1>OPPIDX MATCH</h1>
      </div>
    </div>
    <div class="body">
      <p>Hi ${userName},</p>
      <p>We ran the pool tonight. Nobody was the right fit for you this week.</p>
      <p>Not because there's anything wrong with you. The pool is still growing — and the right person might join next week, or already be in it and need one more data point before we're confident enough to send them your way.</p>
      <p>We'll run again next Friday. You'll hear from us either way.</p>
      <p style="color:#D4600A;font-style:italic">"The right match is worth waiting a week for."</p>
      <div class="sign">OppIDX Match · ${DISPLAY_DOMAIN}</div>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendCronAlertEmail(error: string, matched: number, notified: number) {
  // No fallback address on purpose. This used to default to a personal Gmail,
  // which meant an unset ADMIN_EMAIL silently routed production ops alerts to
  // one individual's inbox instead of failing visibly. Same no-op-when-unset
  // contract as sendOpsAlert() in lib/alerts.ts.
  const ADMIN = process.env.ADMIN_EMAIL;
  if (!ADMIN) {
    console.warn("[email] ADMIN_EMAIL is not set — skipping cron alert email.");
    return;
  }
  await getResend().emails.send({
    from: FROM,
    to: ADMIN,
    subject: `⚠️ OppIDX Match — Friday cron ${error ? "FAILED" : "completed"}`,
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
    <p style="font-size:11px;color:#6B4C35;margin-top:20px">OppIDX Match · Friday cron · ${DISPLAY_DOMAIN}</p>
  </div>
</body></html>`,
  });
}

export async function sendWelcomeEmail(toEmail: string, userName: string, lookingFor: string) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: "You're in the pool — OppIDX Match",
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
  .pill { display:inline-block; background:#D4600A; color:#FAF0D7; padding: 4px 14px; font-size:11px; letter-spacing:2px; margin: 8px 0; }
  .sign { color: #6B4C35; font-size: 11px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #C4A45A; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-inner">
        <img src="${LOGO_URL}" alt="OppIDX" width="72" height="72" style="object-fit:contain;display:block;" />
        <h1>OPPIDX MATCH</h1>
      </div>
    </div>
    <div class="body">
      <p>Hi ${userName},</p>
      <p>Your answers are in. You're in the pool. Looking for: <span class="pill">${lookingFor.toUpperCase()}</span></p>
      <p>Every Friday night, we run the pool. If we find your person, you'll get an email with their contact. If we don't, we'll tell you that too.</p>
      <p><strong>Either way — your result will always be on your dashboard.</strong> Email can get delayed or land in spam. Your dashboard won't. Make it a habit: open it every Friday evening.</p>
      <div style="margin:20px 0;text-align:center">
        <a href="${SITE_URL}/account/dashboard" style="display:inline-block;background:#8B1A1A;color:#FAF0D7;font-family:'Courier New',monospace;font-size:12px;letter-spacing:3px;padding:14px 28px;text-decoration:none;">
          ◆ &nbsp; CHECK YOUR DASHBOARD
        </a>
      </div>
      <p style="font-size:11px;color:#6B4C35">Bookmark it. Every Friday evening, that's where you go first.</p>
      <p style="color:#D4600A;font-style:italic">"5 questions. One match. The rest is yours."</p>
      <div class="sign">OppIDX Match · For the real ones · ${DISPLAY_DOMAIN}<br>Built in India. Thinking from Silicon Valley.</div>
    </div>
  </div>
</body>
</html>`,
  });
}
