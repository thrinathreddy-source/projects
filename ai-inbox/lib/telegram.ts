import { SOCIAL_CHANNELS_ENABLED } from '@/lib/socialChannels'

/** The public channel itself — cross-linked into every Discord digest
 * message so people move freely between the two communities. */
export const TELEGRAM_CHANNEL_URL = 'https://t.me/oppurtunityindex'

/** null when the bot isn't configured yet — callers must check and skip
 * sending, never throw, so a missing token doesn't break the cron run. */
function getConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  return token && chatId ? { token, chatId } : null
}

/** Escapes the handful of characters that break Telegram's HTML parse mode
 * when they show up in scraped opportunity titles/descriptions. */
export function escapeTelegramHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Sends one HTML-formatted message to the configured channel/group.
 * Returns false (never throws) if the bot isn't configured or the send
 * fails — a broken daily digest shouldn't take down anything else. */
export async function sendTelegramMessage(html: string): Promise<boolean> {
  if (!SOCIAL_CHANNELS_ENABLED) return false
  const config = getConfig()
  if (!config) return false

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    })
    if (!res.ok) {
      console.error('[telegram] send failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[telegram] send threw:', err)
    return false
  }
}
