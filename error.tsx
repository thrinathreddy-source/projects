'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'

/** Route-segment error boundary. Server-side errors are already reported
 * to Discord from instrumentation.ts's onRequestError — this just needs to
 * give the visitor a way out and leave a client-side trace in the console
 * for anything that only happened in the browser. */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card-box" style={{ padding: '36px 32px', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ marginBottom: 14 }}><Wordmark size={20} /></div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 12 }}>
          Something tore loose.
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.7 }}>
          That page hit an error on our end. It&apos;s been logged — try again, or head back to the board.
          {error.digest && <><br /><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Ref: {error.digest}</span></>}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => unstable_retry()} style={{
            padding: '11px 22px', borderRadius: 2, border: '1.5px solid var(--line)',
            background: 'transparent', color: 'var(--ink)', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
          }}>
            Try again
          </button>
          <Link href="/browse" style={{
            display: 'inline-block', padding: '11px 22px', borderRadius: 2,
            background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
          }}>
            Back to OppIDX →
          </Link>
        </div>
      </div>
    </div>
  )
}
