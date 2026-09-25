import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { validateResourceSubmission, type ResourceSubmissionInput } from '@/lib/resources/validate'
import { checkUrlReachable, checkDuplicate } from '@/lib/resources/verify'

/**
 * POST /api/resources/submit — public, free. "Submit a resource."
 *
 * No human review queue and no payment, unlike opportunity submissions —
 * a submission either passes the automated checks (field validation, live
 * URL, not a duplicate) and becomes a real, verified Resource immediately,
 * or it's rejected with a reason and nothing is stored. Admin's recourse is
 * removal after the fact via /admin, not pre-approval.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`submit-resource:${getClientIp(req)}`, 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const input: Partial<ResourceSubmissionInput> = {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    url: typeof body.url === 'string' ? body.url.trim() : '',
    category: typeof body.category === 'string' ? body.category.trim() : '',
    audience: typeof body.audience === 'string' ? body.audience.trim() : '',
    submitterEmail: typeof body.submitterEmail === 'string' ? body.submitterEmail.trim().toLowerCase() : '',
  }

  const { ok, errors } = validateResourceSubmission(input)
  if (!ok) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 })
  }

  const reachable = await checkUrlReachable(input.url!)
  if (!reachable.ok) {
    return NextResponse.json({ error: reachable.reason ?? 'That link could not be verified.' }, { status: 400 })
  }

  const duplicate = await checkDuplicate(input.url!)
  if (!duplicate.ok) {
    return NextResponse.json({ error: duplicate.reason ?? 'That resource is already listed.' }, { status: 409 })
  }

  const created = await prisma.resource.create({
    data: {
      title: input.title!,
      description: input.description!,
      url: input.url!,
      category: input.category!,
      audience: input.audience!,
      verified: true,
      source: 'submitted',
      submitterEmail: input.submitterEmail!,
    },
  })

  return NextResponse.json({ ok: true, item: created })
}
