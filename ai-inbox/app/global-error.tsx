'use client'

import { useEffect } from 'react'

/** Catches errors thrown by the root layout itself, where app/error.tsx
 * can't reach (it's wrapped BY the root layout, not wrapping it). Must
 * render its own <html>/<body> — the root layout is bypassed entirely
 * when this is active, so no shared fonts/CSS are available here. */
export default function GlobalError({
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
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f3e9cf', color: '#2b2620', fontFamily: 'Courier New, monospace', padding: 24,
      }}>
        <div style={{
          maxWidth: 440, textAlign: 'center', background: '#fbf3df', border: '1.5px solid rgba(43,38,32,0.22)',
          borderRadius: 3, boxShadow: '4px 4px 0 rgba(43,38,32,0.16)', padding: '36px 32px',
        }}>
          <h1 style={{ fontSize: 20, textTransform: 'uppercase', marginBottom: 12 }}>OppIDX hit an error.</h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 20, opacity: 0.8 }}>
            The whole page failed to load. It&apos;s been logged — try again in a moment.
            {error.digest && <><br /><span style={{ fontSize: 11 }}>Ref: {error.digest}</span></>}
          </p>
          <button onClick={() => unstable_retry()} style={{
            padding: '11px 22px', borderRadius: 2, border: 'none',
            background: '#1f3a5c', color: '#f3e9cf', cursor: 'pointer', fontWeight: 700, fontSize: 13,
          }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
