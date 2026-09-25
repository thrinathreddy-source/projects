import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/unsubscribeToken'

function page(message: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OppIDX</title></head>
<body style="background:#f5f0e8;font-family:'Courier New',monospace;margin:0;padding:0;">
  <div style="max-width:480px;margin:80px auto;background:#faf6ee;border:2px solid #c0432a;padding:32px 28px;text-align:center;">
    <p style="color:#2b2620;font-size:15px;line-height:1.7;margin:0;">${message}</p>
    <a href="/" style="display:inline-block;margin-top:20px;color:#c0432a;font-size:13px;font-weight:bold;text-decoration:none;">← Back to OppIDX</a>
  </div>
</body>
</html>`
}

/** Flips unsubscribedFromDigest, never deletes the subscriber row — that
 * would also erase billing and referral history for a paid subscriber.
 * Returns false only when the token itself doesn't verify. */
async function unsubscribe(token: string): Promise<boolean> {
  const subscriberId = verifyUnsubscribeToken(token)
  if (!subscriberId) return false

  await prisma.subscriber.update({
    where: { id: subscriberId },
    data: { unsubscribedFromDigest: true },
  }).catch(() => null)

  return true
}

/** GET — a person clicking the link in the email. Renders a confirmation. */
export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get('token') ?? '')

  if (!ok) {
    return new NextResponse(page('That link is invalid or already used.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  return new NextResponse(page("You're unsubscribed from the weekly digest. You won't get another one — everything else about your account stays the same."), {
    headers: { 'Content-Type': 'text/html' },
  })
}

/**
 * POST — one-click unsubscribe (RFC 8058), performed by the mail client
 * itself rather than a person.
 *
 * Gmail, Yahoo and Apple require bulk senders to support this, and the
 * `List-Unsubscribe-Post` header lib/email.ts now sends promises that a POST
 * here works. Advertising that header without this handler would be worse
 * than sending neither: providers would get a 405 and score the sender as
 * non-compliant.
 *
 * The spec says the provider sends `List-Unsubscribe=One-Click` as the body
 * and expects a 2xx — no redirect, no HTML, no confirmation step, since
 * there's no human to confirm anything. The signed token is the only
 * authorization needed; it's unguessable and scoped to one subscriber, which
 * is also why this doesn't need CSRF protection.
 *
 * A bad token still returns 200. That's deliberate: a provider retrying a
 * failed unsubscribe is worse for everyone than silently accepting one that
 * was already processed, and the response must not leak whether a given
 * token maps to a real subscriber.
 */
export async function POST(req: NextRequest) {
  await unsubscribe(req.nextUrl.searchParams.get('token') ?? '')
  return new NextResponse(null, { status: 200 })
}
