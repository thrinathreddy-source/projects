import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { SITE_URL } from '@/lib/siteUrl'
import { generateDailyDigest, generateWeeklyDigest } from '@/lib/policyDigest/generate'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendDiscordMessage } from '@/lib/discord'
import { runCronPass } from '@/lib/cronGuard'

/**
 * GET /api/cron/policy-digest — generates today's policy digest (always),
 * and the weekly digest too on Sundays, then posts the shareable link(s) to
 * Telegram/Discord. Meant to be called by an external scheduler (see
 * .github/workflows/policy-digest-cron.yml), not a browser — same
 * Authorization: Bearer CRON_SECRET pattern as the other OppIDX crons.
 *
 * No escaping needed on the message text below — unlike the opportunity
 * digest (app/api/cron/social-digest), every piece of text here is
 * either a plain number or a literal we wrote, never scraped content.
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

  return runCronPass('policy-digest', async () => {
    const daily = await generateDailyDigest()
    const dailyUrl = `${SITE_URL}/pulse/digest/${daily.period}`
    const dailyCount = `${daily.itemCount} action${daily.itemCount === 1 ? '' : 's'}`

    const isSunday = new Date().getUTCDay() === 0
    const weekly = isSunday ? await generateWeeklyDigest() : null
    const weeklyUrl = weekly ? `${SITE_URL}/pulse/digest/${weekly.period}` : null
    const weeklyCount = weekly ? `${weekly.itemCount} action${weekly.itemCount === 1 ? '' : 's'}` : ''

    const telegramMessage = [
      `◈ <b>Today's policy digest</b> — ${dailyCount}`,
      `<a href="${dailyUrl}">Read it →</a>`,
      ...(weeklyUrl ? ['', `◈ <b>This week's roundup</b> — ${weeklyCount}`, `<a href="${weeklyUrl}">Read it →</a>`] : []),
    ].join('\n')

    const discordMessage = [
      `◈ **Today's policy digest** — ${dailyCount}`,
      dailyUrl,
      ...(weeklyUrl ? ['', `◈ **This week's roundup** — ${weeklyCount}`, weeklyUrl] : []),
    ].join('\n')

    const [telegramSent, discordSent] = await Promise.all([
      sendTelegramMessage(telegramMessage),
      sendDiscordMessage(discordMessage),
    ])

    return { daily, weekly, telegramSent, discordSent }
  })
}
