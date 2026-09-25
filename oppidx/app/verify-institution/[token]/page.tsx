import Link from 'next/link'
import { prisma } from '@/lib/db'

async function confirm(token: string): Promise<{ ok: boolean; email?: string; reason?: string }> {
  const subscriber = await prisma.subscriber.findUnique({ where: { institutionVerifyToken: token } })
  if (!subscriber) return { ok: false, reason: 'This link is invalid or was already used.' }
  if (!subscriber.institutionVerifyTokenExpiresAt || subscriber.institutionVerifyTokenExpiresAt < new Date()) {
    return { ok: false, reason: 'This link has expired — request a new one from your account page.' }
  }

  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data: {
      institutionVerified: true,
      institutionVerifiedAt: new Date(),
      institutionVerifyToken: null,
      institutionVerifyTokenExpiresAt: null,
    },
  })

  return { ok: true, email: subscriber.institutionEmail ?? undefined }
}

export default async function VerifyInstitutionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await confirm(token)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card-box" style={{ padding: '30px 28px', maxWidth: 440, textAlign: 'center' }}>
        {result.ok ? (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', marginBottom: 10 }}>
              Verified.
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.6 }}>
              {result.email} is now confirmed on your account.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', marginBottom: 10 }}>
              Couldn&apos;t verify that.
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.6 }}>
              {result.reason}
            </p>
          </>
        )}
        <Link href="/account" style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 2,
          background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
        }}>
          Go to your account →
        </Link>
      </div>
    </div>
  )
}
