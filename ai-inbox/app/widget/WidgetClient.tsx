'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SITE_URL } from '@/lib/siteUrl'

const EMBED_URL = `${SITE_URL}/embed/opportunity-of-the-day`
// The iframe itself carries zero SEO weight for the embedder — a
// cross-origin <iframe> doesn't count as an outbound link on their page as
// far as a crawler's link graph is concerned, only same-page <a> tags do.
// The real link right below it, in the embedder's own HTML, is what
// actually credits them for linking to OppIDX (and is the whole reason
// anyone would want this widget rather than just a screenshot).
const SNIPPET = `<div>
  <iframe src="${EMBED_URL}" width="340" height="190" style="border:none;" title="Opportunity of the Day — OppIDX" loading="lazy"></iframe>
  <div style="font-family:monospace;font-size:11px;margin-top:4px;">Powered by <a href="${SITE_URL}" target="_blank" rel="noopener">OppIDX</a></div>
</div>`

export default function WidgetClient() {
  const [copied, setCopied] = useState(false)

  async function copySnippet() {
    await navigator.clipboard.writeText(SNIPPET)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Back to OppIDX
        </Link>

        <div className="card-box" style={{ marginTop: 20, padding: '36px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 14 }}>◆</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 8 }}>
              Embed OppIDX
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: 420, margin: '0 auto' }}>
              A small &quot;Opportunity of the Day&quot; badge for your blog, newsletter archive, or site. It rolls over
              to a new pick every day on its own — no upkeep, no account, free.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <iframe
              src={EMBED_URL}
              width={340}
              height={190}
              style={{ border: 'none' }}
              title="Opportunity of the Day — OppIDX preview"
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 4, maxWidth: 340 }}>
              Powered by <Link href="/" style={{ color: 'var(--ink-2)' }}>OppIDX</Link>
            </div>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ink)',
            marginBottom: 8, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Paste this where you want it to show up
          </div>

          <pre style={{
            background: 'var(--board)', border: '1.5px solid var(--line)', borderRadius: 2,
            padding: '14px 16px', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
            overflowX: 'auto', marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {SNIPPET}
          </pre>

          <button onClick={copySnippet} style={{
            width: '100%', padding: '13px 26px', borderRadius: 2, border: 'none', cursor: 'pointer',
            background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
            fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '4px 4px 0 var(--shadow)',
          }}>
            {copied ? 'Copied ✓' : 'Copy embed code'}
          </button>

          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginTop: 20 }}>
            Resize the width/height attributes to fit your layout — the badge adapts to the box you give it.
            Every link inside opens in a new tab, so it never navigates your page away.
          </p>
        </div>
      </div>
    </div>
  )
}
