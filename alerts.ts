import { rateLimit } from '@/lib/rateLimit'
import { getResend } from '@/lib/email'

const FROM = process.env.EMAIL_FROM || 'OppIDX <onboarding@resend.dev>'

/**
 * Internal ops alerting — separate from lib/discord.ts's
 * sendDiscordMessage(), which posts to the *public* community server and
 * is gated behind SOCIAL_CHANNELS_ENABLED (currently off). Emails ADMIN_EMAIL
 * directly instead of Discord, since that's not somewhere this gets watched.
 * Plain text, not HTML — this is a wake-up ping, not a newsletter, and it
 * sidesteps ever needing to escape error text for safe HTML rendering.
 *
 * No-ops (returns false, never throws) if ADMIN_EMAIL or RESEND_API_KEY
 * isn't set, same fail-open pattern as every other integration here.
 */
export async function sendOpsAlert(subject: string, details: string): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL
  if (!to) return false

  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to,
      subject: `🚨 ALERT!!! CAUTION — ${subject}`,
      text: `ALERT!!! CAUTION\n\n${details}`,
    })
    if (error) {
      console.error('[alerts] send failed:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[alerts] send threw:', err)
    return false
  }
}

/** A scheduled operational report, deliberately not an urgent alert. */
export async function sendOpsReport(subject: string, details: string): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL
  if (!to) return false
  try {
    const { error } = await getResend().emails.send({
      from: FROM, to, subject: `OppIDX — ${subject}`, text: details,
    })
    if (error) {
      console.error('[alerts] report send failed:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[alerts] report send threw:', err)
    return false
  }
}

/** One alert per distinct error key per window — a crash-looping route
 * would otherwise send hundreds of near-identical emails. */
export async function sendThrottledOpsAlert(key: string, subject: string, details: string): Promise<boolean> {
  const rl = rateLimit(`ops-alert:${key}`, 15 * 60_000, 1)
  if (!rl.ok) return false
  return sendOpsAlert(subject, details)
}
