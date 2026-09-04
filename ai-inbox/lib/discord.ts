import { SOCIAL_CHANNELS_ENABLED } from '@/lib/socialChannels'

/** Permanent (non-expiring) invite to the OppIDX Discord — cross-linked
 * into every Telegram digest message so people move freely between the
 * two communities. */
export const DISCORD_INVITE_URL = 'https://discord.gg/Yde2AnypJ'

/** Escapes Discord markdown control characters that show up in scraped
 * opportunity titles/org names and would otherwise break formatting. */
export function escapeDiscordMarkdown(input: string): string {
  return input.replace(/([*_`~|\\])/g, '\\$1')
}

/**
 * Posts one message to the configured Discord channel via an incoming
 * webhook — no bot application, no OAuth, just a URL from that channel's
 * Integrations settings. Returns false (never throws) if the webhook isn't
 * configured or the send fails — a broken daily digest shouldn't take down
 * anything else.
 */
export async function sendDiscordMessage(content: string): Promise<boolean> {
  if (!SOCIAL_CHANNELS_ENABLED) return false
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return false

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      console.error('[discord] send failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[discord] send threw:', err)
    return false
  }
}
