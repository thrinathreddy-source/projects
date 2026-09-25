'use client'

import { useState } from 'react'

function ShareIcon({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      style={{
        padding: '7px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
        background: 'var(--card)', color: 'var(--ink)', textDecoration: 'none',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
      }}
    >
      {children}
    </a>
  )
}

export function ShareBar({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const text = `${title} — via OppIDX`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently no-op, link is still visible in the address bar.
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <ShareIcon href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>
        WhatsApp
      </ShareIcon>
      <ShareIcon href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}>
        Telegram
      </ShareIcon>
      <ShareIcon href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>
        X
      </ShareIcon>
      <button
        onClick={copyLink}
        style={{
          padding: '7px 14px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
          background: 'var(--card)', color: 'var(--ink)',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
        }}
      >
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  )
}
