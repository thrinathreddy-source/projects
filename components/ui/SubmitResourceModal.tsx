'use client'

import { useState } from 'react'
import { Modal, ModalHeader, modalInputStyle, ModalSubmitButton, ModalError } from '@/components/ui/Modal'

const VALID_CATEGORIES = [
  'Financial Literacy', 'Spiritual Literacy',
  'Test Prep', 'Financial Aid', 'Mentorship', 'Templates & Guides',
  'Courses', 'Communities', 'Tools', 'Scholarship Search', 'Other',
]
const VALID_AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']

/** A direct port of /resources/submit into a popup, prefilled with the
 * category the opportunity itself already matched on (see
 * lib/opportunityResourceMap.ts) and its audience — both still fully
 * editable. Same unauthenticated, no-review-queue endpoint. */
export function SubmitResourceModal({ opportunityTitle, defaultCategory, defaultAudience, onClose }: {
  opportunityTitle: string
  defaultCategory: string
  defaultAudience: string
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [audience, setAudience] = useState(defaultAudience)
  const [submitterEmail, setSubmitterEmail] = useState('')

  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      const res = await fetch('/api/resources/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, url, category, audience, submitterEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setState('error'); return }
      setState('done')
    } catch {
      setError('Something went wrong. Try again.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <Modal onClose={onClose}>
        <ModalHeader title="It's live." onClose={onClose} />
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Your link checked out and is now listed on /resources — thank you for adding to the pile.
        </p>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <ModalHeader title="Add a guide" subtitle={`For people chasing "${opportunityTitle}"`} onClose={onClose} />

        <input style={modalInputStyle()} placeholder="Title" required value={title} onChange={e => setTitle(e.target.value)} />
        <textarea style={{ ...modalInputStyle(), minHeight: 70, resize: 'vertical' }} placeholder="What is it, and who does it help? (20+ characters)" required value={description} onChange={e => setDescription(e.target.value)} />
        <input style={modalInputStyle()} placeholder="URL (https://…)" required value={url} onChange={e => setUrl(e.target.value)} />
        <select style={modalInputStyle()} value={category} onChange={e => setCategory(e.target.value)}>
          {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={modalInputStyle()} value={audience} onChange={e => setAudience(e.target.value)}>
          {VALID_AUDIENCES.map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
        </select>
        <input style={modalInputStyle()} type="email" placeholder="Your email (moderation only, never published)" required value={submitterEmail} onChange={e => setSubmitterEmail(e.target.value)} />

        <ModalError>{error}</ModalError>

        <ModalSubmitButton type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Checking the link…' : 'Submit →'}
        </ModalSubmitButton>
      </form>
    </Modal>
  )
}
