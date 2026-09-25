import { Resend } from 'resend'
import { signUnsubscribeToken } from '@/lib/unsubscribeToken'
import { SITE_URL } from '@/lib/siteUrl'
import { opportunityPath } from '@/lib/slug'
import { alignBatchIds } from '@/lib/resendBatchAlignment'

// Separate from lib/platform/email.ts on purpose — same Resend account and
// free tier, but a different FROM identity and template voice for OppIDX
// proper vs. the matching side.
//
// Lazily constructed: the Resend SDK throws synchronously in its
// constructor if RESEND_API_KEY is missing, and this module is imported
// (transitively) by most API routes. Building it at module scope meant any
// environment without that key set — a fresh checkout, CI — failed
// `next build` entirely at "Collecting page data", for routes that never
// even send email. Exported as a getter (not just used internally) so the
// webhook route can call getResend().webhooks.verify with the same client.
let _resend: Resend | null = null
export function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
/**
 * The sending identity.
 *
 * `onboarding@resend.dev` is Resend's shared sandbox address and it can only
 * deliver to the email on the Resend account itself — every send to a real
 * subscriber is rejected. It used to be the silent fallback here, which meant
 * an unset EMAIL_FROM looked exactly like a working configuration until you
 * noticed the weekly digest had never actually arrived for anyone, and the
 * only symptom was an opaque `[Resend API Error]: {}` in the logs.
 *
 * It's still the fallback, because failing the build or throwing at import
 * time would take down every route that merely imports this module. But it
 * now announces itself loudly and `emailSenderReady()` lets callers check
 * before doing work that assumes delivery.
 *
 * Beyond setting this, the sending domain also needs SPF, DKIM and DMARC
 * records — Gmail and Yahoo have required all three from bulk senders since
 * February 2024, and the From: domain must match what SPF/DKIM authenticate.
 * Those are DNS records at the registrar, not something this file can set.
 */
const SANDBOX_FROM = 'OppIDX <onboarding@resend.dev>'
const FROM = process.env.EMAIL_FROM || SANDBOX_FROM

/** False when EMAIL_FROM is unset, i.e. mail can only reach the Resend
 * account owner. Lets a caller skip or flag work that assumes real delivery
 * rather than discovering it from a per-recipient error. */
export function emailSenderReady(): boolean {
  return Boolean(process.env.EMAIL_FROM)
}

if (!process.env.EMAIL_FROM && process.env.NODE_ENV === 'production') {
  console.error(
    '[email] EMAIL_FROM is not set — falling back to Resend\'s sandbox address, which can ' +
    'ONLY deliver to the Resend account owner. Every subscriber send will be rejected. ' +
    'Verify oppidx.com in Resend, add its SPF/DKIM records, then set EMAIL_FROM.'
  )
}

// Resend's batch endpoint caps at 100 emails per call — chunk rather than
// assume the subscriber list always fits in one request.
const BATCH_SIZE = 100

export interface WeeklyDigestEmailData {
  weekRangeLabel: string
  totalOpportunities: number
  newLast7Days: number
  topPicks: { title: string; org: string | null; id: string; slug: string | null; description: string }[]
}

/** Escapes text interpolated into the email's HTML. Listing titles and orgs
 * are scraped third-party strings — an unescaped `&` or `<` in one either
 * renders as mojibake or breaks the surrounding markup. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Truncates on a word boundary so a line never ends mid-word.
 *
 * Also drops trailing punctuation and any unbalanced opening bracket or
 * quote. Listing titles genuinely contain things like
 * `MacArthur Fellowship ("Genius Grant")`, which a naive cut turns into
 * `MacArthur Fellowship ("Genius` — a dangling quote that reads as a bug in
 * the one line of the email people actually see.
 */
function truncateWords(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean

  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  let out = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim()

  // Drop a trailing opener whose partner didn't survive the cut.
  for (const [open, close] of [['(', ')'], ['[', ']'], ['"', '"'], ['“', '”']]) {
    const opens = out.split(open).length - 1
    const closes = open === close ? opens : out.split(close).length - 1
    if (open === close ? opens % 2 === 1 : opens > closes) {
      out = out.slice(0, out.lastIndexOf(open)).trim()
    }
  }

  // Trailing conjunctions and connectors read as a truncation bug in a
  // subject line — "MacArthur Fellowship &" followed by "+ 1 more".
  return out.replace(/[,;:–—\-(["“&/+]+$/, '').replace(/\s+(and|or|&|of|for|the|a|in|at|to)$/i, '').trim()
}

/**
 * The subject line.
 *
 * Was `This week's top opportunities from OppIDX — {date range}`: 69
 * characters against a 30–50 optimum, so mobile clients (iPhone Mail ~40,
 * Gmail app ~37) showed "This week's top opportunit…". It also spent its
 * first and most-read words on the brand name, which the From field already
 * carries, and was byte-identical every week apart from a date nobody reads
 * — so nothing distinguished this issue from the last one.
 *
 * Naming the actual lead pick makes it specific, front-loaded, and genuinely
 * different every send. Falls back to the generic form only when there are no
 * picks, which shouldn't happen but shouldn't crash the send if it does.
 */
export function weeklyDigestSubject(digest: WeeklyDigestEmailData): string {
  const lead = digest.topPicks[0]
  if (!lead) return 'This week on OppIDX'

  const others = digest.topPicks.length - 1
  const suffix = others > 0 ? ` + ${others} more` : ''
  // Budget the title against a ~50-char target so the whole subject survives
  // truncation rather than just its opening words.
  return `${truncateWords(lead.title, 50 - suffix.length)}${suffix}`
}

/**
 * Inbox preview text — the second thing a reader sees, after the subject.
 *
 * There was none, so clients fell back to scraping the first text in the
 * body: "OPPIDX WEEKLY" followed by a date. That put the least persuasive
 * characters in the email into its second-most-read position.
 *
 * Written to *extend* the subject rather than repeat it — the subject names
 * the lead pick, so this names what else is inside. Kept near 90 characters:
 * the core has to survive truncation around 40–60 on mobile.
 */
const PREHEADER_MAX = 100

export function weeklyDigestPreheader(digest: WeeklyDigestEmailData): string {
  // Kept lowercase so it reads correctly after "— and"; capitalised below
  // for the standalone case.
  const tail = digest.newLast7Days > 0
    ? `${digest.newLast7Days} more added this week, all checked by hand.`
    : 'every one on the board is checked by hand.'

  const rest = digest.topPicks.slice(1, 3).map(p => truncateWords(p.title, 26)).filter(Boolean)
  if (rest.length === 0) {
    return truncateWords(tail.charAt(0).toUpperCase() + tail.slice(1), PREHEADER_MAX)
  }

  // Built longest-first then trimmed, so the cap is enforced on the real
  // string rather than assumed from the parts.
  const full = `${rest.join(', ')} — and ${tail}`
  if (full.length <= PREHEADER_MAX) return full

  const one = `${rest[0]} — and ${tail}`
  return truncateWords(one, PREHEADER_MAX)
}

function weeklyDigestHtml(digest: WeeklyDigestEmailData, unsubscribeUrl: string): string {
  // A pick with just a title and no snippet gives a reader nothing to act
  // on without clicking blind — this is the one line of actual context
  // that makes "top 10 this week" worth opening instead of just a list of
  // links. Truncated short: this is a teaser, not the full listing.
  const picksHtml = digest.topPicks.map((p, i) => `
    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #e0d6c4;">
      <span style="color:#5b5346;font-size:12px;font-weight:bold;">${i + 1}.</span>
      <a href="${SITE_URL}${opportunityPath(p)}" style="color:#c0432a;font-weight:bold;font-size:14px;text-decoration:none;">${esc(p.title)}</a>
      ${p.org ? `<div style="color:#5b5346;font-size:12.5px;margin-top:2px;margin-left:16px;">${esc(p.org)}</div>` : ''}
      ${p.description ? `<div style="color:#2b2620;font-size:12.5px;margin-top:5px;margin-left:16px;line-height:1.5;">${esc(p.description.slice(0, 110))}${p.description.length > 110 ? '…' : ''}</div>` : ''}
    </div>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="background:#f5f0e8;font-family:'Courier New',monospace;margin:0;padding:0;">
  <!-- Preview text: first in the body, hidden in the rendered email. The
       trailing zero-width non-joiners stop clients padding the preview with
       whatever markup follows. See weeklyDigestPreheader(). -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#faf6ee;opacity:0;">
    ${esc(weeklyDigestPreheader(digest))}
    ${'&#8204;&nbsp;'.repeat(60)}
  </div>
  <div style="max-width:480px;margin:40px auto;background:#faf6ee;border:2px solid #c0432a;padding:32px 28px;">
    <div style="color:#2b2620;font-size:20px;font-weight:bold;letter-spacing:2px;margin-bottom:6px;">OPPIDX WEEKLY</div>
    <div style="color:#5b5346;font-size:13px;margin-bottom:4px;">${digest.weekRangeLabel}</div>
    <div style="color:#2b2620;font-size:14px;font-weight:bold;margin-bottom:22px;">This week's top ${digest.topPicks.length} opportunities</div>

    <div style="display:table;width:100%;margin-bottom:24px;">
      <div style="display:table-cell;text-align:center;">
        <div style="color:#c0432a;font-size:22px;font-weight:bold;">${digest.totalOpportunities.toLocaleString()}</div>
        <div style="color:#5b5346;font-size:10.5px;text-transform:uppercase;">On the board</div>
      </div>
      <div style="display:table-cell;text-align:center;">
        <div style="color:#c0432a;font-size:22px;font-weight:bold;">${digest.newLast7Days}</div>
        <div style="color:#5b5346;font-size:10.5px;text-transform:uppercase;">Added this week</div>
      </div>
    </div>

    ${picksHtml}

    <a href="${SITE_URL}/browse" style="display:inline-block;margin-top:8px;padding:11px 20px;background:#c0432a;color:#faf6ee;text-decoration:none;font-weight:bold;font-size:13px;">
      See the full board →
    </a>

    <p style="color:#5b5346;font-size:12px;margin:20px 0 0;line-height:1.6;">
      Also this week: <a href="${SITE_URL}/pulse" style="color:#c0432a;">OppIDX Pulse</a> — a daily, apolitical read on real government and regulatory action, written from real headlines.
    </p>

    <p style="color:#5b5346;font-size:11px;margin:20px 0 0;line-height:1.6;">
      Real, hand-verified opportunities — ranked by genuine views, not hype or fake urgency.
      <br><a href="${unsubscribeUrl}" style="color:#5b5346;">Unsubscribe from this weekly email</a>
    </p>
  </div>
</body>
</html>`
}

export interface DigestRecipient {
  subscriberId: string
  email: string
}

export interface DigestSendResult {
  subscriberId: string
  resendId: string | null
  error: string | null
}

/**
 * Sends the week's top-10-by-real-viewcount opportunities to every
 * recipient in one batch call per 100 (Resend's own limit) instead of one
 * request per subscriber — fewer round trips, and 'permissive' validation
 * means one bad address in a batch doesn't block the other 99. Every send
 * still gets its own unsubscribe link; the caller (the weekly cron) is
 * responsible for logging each result against DigestEmailLog for
 * idempotency and webhook correlation. This is deliberately the only
 * recurring email OppIDX sends — no daily email, by design.
 */
export async function sendWeeklyDigestBatch(
  recipients: DigestRecipient[],
  digest: WeeklyDigestEmailData
): Promise<DigestSendResult[]> {
  const results: DigestSendResult[] = []

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE)
    const subject = weeklyDigestSubject(digest)
    const payload = chunk.map(r => {
      const unsubscribeUrl = `${SITE_URL}/api/subscribe/unsubscribe?token=${signUnsubscribeToken(r.subscriberId)}`
      return {
        from: FROM,
        to: r.email,
        subject,
        html: weeklyDigestHtml(digest, unsubscribeUrl),
        // One-click unsubscribe (RFC 8058). Google, Yahoo and Apple all
        // require this of bulk senders — a link in the body doesn't satisfy
        // it, and its absence pushes mail toward spam regardless of how good
        // the content is. Both headers are needed: List-Unsubscribe alone
        // makes clients fall back to opening the URL in a browser, while
        // List-Unsubscribe-Post is what lets the mail client complete the
        // unsubscribe itself with a single tap.
        //
        // The existing GET route stays the human-facing path; it already
        // accepts this same signed token, so a POST from a mail provider and
        // a click from a person converge on one code path.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    try {
      const { data, error } = await getResend().batch.send(payload, { batchValidation: 'permissive' })
      if (error) {
        chunk.forEach(r => results.push({ subscriberId: r.subscriberId, resendId: null, error: error.message }))
        continue
      }
      const permissiveErrors = new Map((data as { errors?: { index: number; message: string }[] })?.errors?.map(e => [e.index, e.message]) ?? [])
      // Positional indexing into data.data is only correct if Resend returns a
      // slot per submitted email including failures — see
      // lib/resendBatchAlignment.ts for why that must not be assumed, and what
      // attaching an id to the wrong recipient costs.
      const alignedIds = alignBatchIds(chunk.length, data?.data ?? [], permissiveErrors.keys())
      chunk.forEach((r, idx) => {
        const errMsg = permissiveErrors.get(idx)
        results.push({
          subscriberId: r.subscriberId,
          resendId: errMsg ? null : alignedIds[idx],
          error: errMsg ?? null,
        })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      chunk.forEach(r => results.push({ subscriberId: r.subscriberId, resendId: null, error: message }))
    }
  }

  return results
}

export async function sendWelcomeEmail(toEmail: string) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: "You're on the list — OppIDX",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#f5f0e8;font-family:'Courier New',monospace;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;background:#faf6ee;border:2px solid #c0432a;padding:32px 28px;">
    <div style="color:#2b2620;font-size:20px;font-weight:bold;letter-spacing:2px;margin-bottom:16px;">WELCOME TO OPPIDX</div>
    <p style="color:#2b2620;font-size:14px;line-height:1.7;margin:0 0 20px;">
      You're on the list for the weekly email — the real top 10 opportunities of the week, ranked by genuine views, once a week. No hype, no fake urgency, no inflated numbers. Just what's actually there.
    </p>
    <a href="${SITE_URL}/browse" style="display:inline-block;padding:11px 20px;background:#c0432a;color:#faf6ee;text-decoration:none;font-weight:bold;font-size:13px;">
      Browse the board now →
    </a>
    <p style="color:#5b5346;font-size:11px;margin:28px 0 0;line-height:1.6;">
      Didn't expect this? You (or someone with your email) signed up at oppidx.com — reply and let us know if that wasn't you.
    </p>
  </div>
</body>
</html>`,
  })
}

export async function sendInstitutionVerificationEmail(toEmail: string, verifyUrl: string) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Verify your email for OppIDX',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#F4EEDD;font-family:'Courier New',monospace;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;background:#FAF4E4;border:2px solid #C4A45A;padding:32px 28px;">
    <p style="color:#2B2620;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Click below to verify <strong>${toEmail}</strong> on OppIDX. This proves you control the address — it'll show on your profile so others can judge it for themselves.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;padding:12px 22px;background:#8B4513;color:#FAF0D7;text-decoration:none;font-weight:bold;font-size:13px;">
      Verify email →
    </a>
    <p style="color:#6B5B3E;font-size:12px;margin:24px 0 0;">
      Didn't request this? Ignore this email — nothing happens unless you click the link.
    </p>
  </div>
</body>
</html>`,
  })
}
