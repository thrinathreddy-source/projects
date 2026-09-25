// SMS via Twilio — optional, not used by default (we use email via Resend)
// Only activate if you set Twilio env vars and want SMS on top of email

export async function sendMatchSMS(toPhone: string, matchName: string, matchContact: string, matchContactType: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const contactLabel = matchContactType === "phone" ? "number" : matchContactType;
  await client.messages.create({
    body: `OppIDX ◆ Your match: ${matchName} — ${contactLabel}: ${matchContact}\n— oppidx.com`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: toPhone,
  });
}

export async function sendWelcomeSMS(toPhone: string, name: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: `Welcome to OppIDX, ${name}. Your profile is in. We run matches every Friday.\n— oppidx.com`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: toPhone,
  });
}
