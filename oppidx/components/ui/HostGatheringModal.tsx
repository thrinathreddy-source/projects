'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Modal, ModalHeader, modalInputStyle, ModalSubmitButton, ModalError } from '@/components/ui/Modal'

const CATEGORIES = ['Gathering', 'Meetup', 'Workshop', 'Talk', 'Party', 'Sport', 'Other']

function minDateTime() {
  const d = new Date(Date.now() + 60 * 60_000)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

/** A direct port of /events/new into a popup — same fields, same
 * unauthenticated /api/events/create endpoint, same "no account,
 * live in seconds" model. Only difference is where it's triggered from —
 * opportunityTitle is omitted when opened from a non-opportunity context
 * (e.g. the Resources page's own "Host a gathering" button), in which case
 * the title field just starts blank instead of prefilled. */
export function HostGatheringModal({ opportunityTitle, onClose }: { opportunityTitle?: string; onClose: () => void }) {
  const [title, setTitle] = useState(opportunityTitle ? `${opportunityTitle} — meetup` : '')
  const [category, setCategory] = useState('Gathering')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [capacity, setCapacity] = useState('')
  const [isListed, setIsListed] = useState(true)
  const [hostName, setHostName] = useState('')
  const [hostContact, setHostContact] = useState('')

  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ slug: string; manageToken: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      const res = await fetch('/api/events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, location, category, hostName, hostContact, isListed,
          capacity: capacity || null,
          eventTime: eventTime ? new Date(eventTime).toISOString() : '',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Couldn’t create your event.'); setState('error'); return }
      setResult({ slug: data.slug, manageToken: data.manageToken })
      setState('done')
    } catch {
      setError('Something went wrong. Try again.')
      setState('error')
    }
  }

  if (state === 'done' && result) {
    const manageUrl = `/events/${result.slug}/manage?token=${result.manageToken}`
    return (
      <Modal onClose={onClose}>
        <ModalHeader title="Your gathering is live." onClose={onClose} />
        <div style={{ padding: '12px 14px', marginBottom: 16, background: 'var(--board)', border: '1px solid var(--line)', borderRadius: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>Save this link — it&apos;s the only way to manage it</div>
          <div style={{ fontSize: 11.5, wordBreak: 'break-all', fontFamily: 'var(--font-mono)', color: 'var(--pin)' }}>{manageUrl}</div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 18, lineHeight: 1.5 }}>
          No account, no password — that link is your key. {!isListed && 'Unlisted — only people you share the link with can find it.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href={manageUrl} onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '10px 16px', borderRadius: 2, background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5 }}>Guest list →</Link>
          <Link href={`/events/${result.slug}`} onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '10px 16px', borderRadius: 2, border: '1.5px solid var(--line)', color: 'var(--ink)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5 }}>View page →</Link>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <ModalHeader title="Host a gathering" subtitle="No account needed — live in seconds." onClose={onClose} />

        <input style={modalInputStyle()} placeholder="Title" required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
        <select style={modalInputStyle()} value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <textarea style={{ ...modalInputStyle(), minHeight: 70, resize: 'vertical' }} placeholder="What's happening, who it's for, what to bring…" required maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} />
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...modalInputStyle(), flex: 1 }} placeholder="Location" required value={location} onChange={e => setLocation(e.target.value)} />
          <input style={{ ...modalInputStyle(), flex: 1 }} type="datetime-local" required min={minDateTime()} value={eventTime} onChange={e => setEventTime(e.target.value)} />
        </div>
        <input style={modalInputStyle()} type="number" min={1} max={100000} placeholder="Capacity (optional — blank for unlimited)" value={capacity} onChange={e => setCapacity(e.target.value)} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.5 }}>
          <input type="checkbox" checked={isListed} onChange={e => setIsListed(e.target.checked)} style={{ marginTop: 2 }} />
          List this publicly on Resources so anyone can discover it. Off — only people with the direct link can find it.
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...modalInputStyle(), flex: 1 }} placeholder="Your name" required value={hostName} onChange={e => setHostName(e.target.value)} />
          <input style={{ ...modalInputStyle(), flex: 1 }} placeholder="Your contact (phone/WhatsApp)" required value={hostContact} onChange={e => setHostContact(e.target.value)} />
        </div>

        <ModalError>{error}</ModalError>

        <ModalSubmitButton type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Publishing…' : 'Publish gathering →'}
        </ModalSubmitButton>

        <p style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 12, lineHeight: 1.5 }}>
          You&apos;re responsible for your event&apos;s legality and any required permits — see <Link href="/match/terms" style={{ color: 'var(--ink-3)' }}>Terms</Link>.
        </p>
      </form>
    </Modal>
  )
}
