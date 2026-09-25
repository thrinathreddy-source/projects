import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { validateSubmission, type SubmissionInput } from '@/lib/submissions/validate'
import { inferGeo } from '@/lib/scraper/geo'
import { templateOpportunitySummary } from '@/lib/scraper/summarize'
import { newSlug } from '@/lib/slug'

/**
 * POST /api/opportunities/submit — public, free. "Enlist your opportunity."
 *
 * Opportunity listings are free — OppIDX only charges for advertisements
 * (see /advertise), never for a listing itself. This creates the
 * Opportunity directly as unverified, landing in the same admin "Needs
 * review" queue every other hand-submitted listing already goes through —
 * no payment, no Razorpay order, nothing published until a human approves it.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`submit-opp:${getClientIp(req)}`, 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const input: Partial<SubmissionInput> = {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    url: typeof body.url === 'string' ? body.url.trim() : '',
    org: typeof body.org === 'string' ? body.org.trim() : '',
    audience: typeof body.audience === 'string' ? body.audience.trim() : '',
    eligibility: typeof body.eligibility === 'string' ? body.eligibility.trim() : '',
    prepResources: typeof body.prepResources === 'string' ? body.prepResources.trim() : '',
    difficulty: typeof body.difficulty === 'string' ? body.difficulty.trim() : 'Medium',
    tags: typeof body.tags === 'string' ? body.tags.trim() : '',
    location: typeof body.location === 'string' ? body.location.trim() : '',
    compType: typeof body.compType === 'string' ? body.compType.trim() : '',
    submitterEmail: typeof body.submitterEmail === 'string' ? body.submitterEmail.trim().toLowerCase() : '',
    // Not fee-tiering anymore (submission is free either way) — kept as a
    // simple category so the admin queue still shows what kind of listing
    // this is at a glance.
    listingType: typeof body.listingType === 'string' ? body.listingType.trim() : '',
    wantsFeatured: false,
  }

  const { ok, errors } = validateSubmission(input)
  if (!ok) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 })
  }

  const geo = inferGeo(input.location)
  // employmentType isn't collected on this form (unlike scraped listings,
  // which sometimes get a real source-disclosed value) — passing null here
  // is honest, not a gap: the template already falls back to an
  // audience-based label when it's absent.
  const summary = templateOpportunitySummary({
    org: input.org || null,
    location: input.location || null,
    audience: input.audience!,
    employmentType: null,
    compType: input.compType || null,
  })

  try {
    const opp = await prisma.opportunity.create({
      data: {
        title: input.title!,
        slug: newSlug({ title: input.title!, org: input.org || null }),
        description: input.description!,
        summary,
        url: input.url!,
        org: input.org || null,
        audience: input.audience!,
        eligibility: input.eligibility!,
        prepResources: input.prepResources || '',
        difficulty: input.difficulty || 'Medium',
        tags: input.tags || '',
        location: input.location || null,
        region: geo.region,
        country: geo.country,
        compType: input.compType || null,
        verified: false,
        featured: false,
        source: 'user-provided',
        sourceUrl: null,
        submitterEmail: input.submitterEmail || null,
      },
    })

    return NextResponse.json({ ok: true, id: opp.id })
  } catch (err) {
    console.error('[submit] failed to create opportunity:', err)
    return NextResponse.json({ error: 'Could not submit. Please try again.' }, { status: 500 })
  }
}
