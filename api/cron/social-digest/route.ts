import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { SITE_URL } from '@/lib/siteUrl'
import { getDailyPicks, AUDIENCE_LABEL } from '@/lib/dailyPicks'
import { sendTelegramMessage, escapeTelegramHtml, TELEGRAM_CHANNEL_URL } from '@/lib/telegram'
import { sendDiscordMessage, escapeDiscordMarkdown, DISCORD_INVITE_URL } from '@/lib/discord'
import { getActiveSponsorSlot } from '@/lib/sponsor'
import { snapshotDailyDigest, todayDateString } from '@/lib/dailyDigest'
import { runCronPass } from '@/lib/cronGuard'

/**
 * GET /api/cron/social-digest — posts today's random pick (see
 * lib/dailyPicks.ts) to every configured distribution channel. Each
 * channel independently no-ops (not an error) if its own env vars aren't
 * set yet, so adding a new platform here never requires the others to be
 * configured too.
 *
 * Deliberately does NOT send an email — the only recurring email OppIDX
 * sends is the weekly top-10 (see app/api/cron/weekly-digest-email/route.ts).
 * This route stays daily for Telegram/Discord/the /newsletter web page,
 * which are a different promise than "one email a week."
 *
 * Every message ends with a link back to the site — this is a
 * distribution channel meant to drive traffic to OppIDX, not a bypass of
 * it. Same shared-secret auth pattern as the other crons — see
 * .github/workflows/social-digest-cron.yml for the schedule.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not set up yet.' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runCronPass('social-digest', async () => {
  const items = await getDailyPicks()
  if (items.length === 0) {
    return { sent: false, reason: 'nothing to pick from' }
  }

  // Durable, shareable web page for today's picks — see /newsletter.
  // Independent of the Telegram/Discord sends below; a failure here never
  // blocks the actual distribution.
  await snapshotDailyDigest(items.map(o => o.id)).catch(err => {
    console.error('[social-digest] snapshot failed:', err)
  })

  // A manually-booked sponsor line (see lib/sponsor.ts) — no self-serve
  // purchase flow, just a row someone added from /admin after an off-platform
  // deal. Silently absent (not an error) on every ordinary day.
  const sponsor = await getActiveSponsorSlot()
  const digestUrl = `${SITE_URL}/newsletter/${todayDateString()}`

  // ── Telegram (HTML) ──
  const telegramLines = items.map(o => {
    const audience = AUDIENCE_LABEL[o.audience] ?? o.audience
    const meta = [audience, o.difficulty, o.location].filter(Boolean).join(' · ')
    const org = o.org ? `${escapeTelegramHtml(o.org)}\n` : ''
    return `<b>${escapeTelegramHtml(o.title)}</b>\n${org}${escapeTelegramHtml(meta)}\n<a href="${SITE_URL}/opportunities/${o.id}">View &amp; apply →</a>`
  })
  const telegramSponsorLine = sponsor
    ? `<i>Today's picks brought to you by <a href="${sponsor.sponsorUrl}">${escapeTelegramHtml(sponsor.sponsorName)}</a> — ${escapeTelegramHtml(sponsor.tagline)}</i>\n\n`
    : ''
  const telegramFooter = `<a href="${digestUrl}">See today's digest online →</a> · <a href="${SITE_URL}/browse">Full board →</a> · <a href="${DISCORD_INVITE_URL}">Discord →</a>`
  let telegramMessage = `✦ <b>Today's picks from OppIDX</b>\n\n${telegramSponsorLine}${telegramLines.join('\n\n')}\n\n${telegramFooter}`
  if (telegramMessage.length > 4000) {
    telegramMessage = `${telegramMessage.slice(0, 3980 - telegramFooter.length)}…\n\n${telegramFooter}`
  }

  // ── Discord (Markdown) ──
  const discordLines = items.map(o => {
    const audience = AUDIENCE_LABEL[o.audience] ?? o.audience
    const meta = [audience, o.difficulty, o.location].filter(Boolean).join(' · ')
    const org = o.org ? `${escapeDiscordMarkdown(o.org)}\n` : ''
    return `**${escapeDiscordMarkdown(o.title)}**\n${org}${escapeDiscordMarkdown(meta)}\n[View & apply →](${SITE_URL}/opportunities/${o.id})`
  })
  const discordSponsorLine = sponsor
    ? `*Today's picks brought to you by [${escapeDiscordMarkdown(sponsor.sponsorName)}](${sponsor.sponsorUrl}) — ${escapeDiscordMarkdown(sponsor.tagline)}*\n\n`
    : ''
  const discordFooter = `[See today's digest online →](${digestUrl}) · [Full board →](${SITE_URL}/browse) · [Telegram →](${TELEGRAM_CHANNEL_URL})`
  let discordMessage = `✦ **Today's picks from OppIDX**\n\n${discordSponsorLine}${discordLines.join('\n\n')}\n\n${discordFooter}`
  // Discord's webhook content field caps at 2000 chars, tighter than Telegram's.
  if (discordMessage.length > 1900) {
    discordMessage = `${discordMessage.slice(0, 1880 - discordFooter.length)}…\n\n${discordFooter}`
  }

  const [telegramSent, discordSent] = await Promise.all([
    sendTelegramMessage(telegramMessage),
    sendDiscordMessage(discordMessage),
  ])

  return { count: items.length, telegramSent, discordSent, sponsored: !!sponsor }
  })
}
