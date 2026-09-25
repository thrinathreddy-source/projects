'use client'

import { useState } from 'react'
import Link from 'next/link'
import { validateSubmission, type SubmissionInput } from '@/lib/submissions/validate'

const AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const LISTING_TYPES: { value: string; label: string }[] = [
  { value: 'scholarship_grant', label: 'Scholarship / Fellowship / Grant' },
  { value: 'competition', label: 'Competition / Hackathon' },
  { value: 'job_internship', label: 'Job / Internship (company hiring)' },
]

const EMPTY_FORM: SubmissionInput = {
  title: '', description: '', url: '', org: '', audience: 'STUDENT',
  eligibility: '', prepResources: '', difficulty: 'Medium',
  tags: '', location: '', compType: '', submitterEmail: '',
  listingType: 'scholarship_grant', wantsFeatured: false,
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '11px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 14,
  }
}

/**
 * Free public submission — listings are never paid for on OppIDX, only
 * advertisements are (see /advertise). Submitting here doesn't publish
 * immediately: it lands in the same admin review queue every listing
 * clears before going live, same as a scraped one.
 */
export default function SubmitClient() {
  const [form, setForm] = useState<SubmissionInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<string[]>([])
  const [stage, setStage] = useState<'form' | 'sending' | 'done'>('form')
  const [error, setError] = useState('')

  function set<K extends keyof SubmissionInput>(key: K, value: SubmissionInput[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { ok, errors: validationErrors } = validateSubmission(form)
    if (!ok) {
      setErrors(validationErrors)
      return
    }
    setErrors([])
    setStage('sending')

    try {
      const res = await fetch('/api/opportunities/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setStage('done')
    } catch (err) {
      setStage('form')
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  if (stage === 'done') {
    return (
      <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
            ← Back to OppIDX
          </Link>
          <div className="card-box" style={{ marginTop: 20, padding: '36px 32px', textAlign: 'center' }}>
            <div style={{ color: 'var(--pin)', marginBottom: 14 }}>◆</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 12 }}>
              Submitted.
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              We hand-review every submission before it goes live — no payment, ever. We&apos;ll be in touch at the email you gave us if we need anything else.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Back to OppIDX
        </Link>

        <div className="card-box" style={{ marginTop: 20, padding: '32px 30px' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 12 }}>◆</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 8 }}>
              Enlist your opportunity
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: 460, margin: '0 auto' }}>
              Listing here is free — we only ever charge for advertisements (see /advertise), never for a
              listing itself. We hand-review every submission before it goes live.
            </p>
          </div>

          <div style={{
            background: 'var(--board)', border: '1.5px solid var(--line)', borderRadius: 2,
            padding: '16px 18px', marginBottom: 24, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              What clears review
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Nothing illegal, and nothing suggestive.</li>
              <li>One link only — a direct, secure (https) link to the application itself.</li>
              <li>No phone numbers, no @handles, no &quot;DM us,&quot; no email addresses in the listing text.</li>
              <li>No shortened, social, or redirect links standing in for the real application page.</li>
            </ul>
          </div>

          <form onSubmit={submit}>
            <input style={inputStyle()} placeholder="Title" required value={form.title} onChange={e => set('title', e.target.value)} />
            <input style={inputStyle()} placeholder="Organization" value={form.org} onChange={e => set('org', e.target.value)} />
            <textarea style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }} placeholder="Description (at least a real paragraph)" required value={form.description} onChange={e => set('description', e.target.value)} />
            <input style={inputStyle()} placeholder="Application URL (https://the-org's-own-page.com/…)" required value={form.url} onChange={e => set('url', e.target.value)} />
            <select style={inputStyle()} value={form.audience} onChange={e => set('audience', e.target.value)}>
              {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select style={inputStyle()} value={form.listingType} onChange={e => set('listingType', e.target.value)}>
              {LISTING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <textarea style={{ ...inputStyle(), minHeight: 60, resize: 'vertical' }} placeholder="Eligibility — who can actually apply" required value={form.eligibility} onChange={e => set('eligibility', e.target.value)} />
            <textarea style={{ ...inputStyle(), minHeight: 60, resize: 'vertical' }} placeholder="Suggested prep resources (optional)" value={form.prepResources} onChange={e => set('prepResources', e.target.value)} />
            <select style={inputStyle()} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d} difficulty</option>)}
            </select>
            <input style={inputStyle()} placeholder="Tags, comma-separated (remote,paid,ai)" value={form.tags} onChange={e => set('tags', e.target.value)} />
            <input style={inputStyle()} placeholder="Location" value={form.location} onChange={e => set('location', e.target.value)} />
            <input style={inputStyle()} placeholder="Compensation (Paid / Unpaid / Stipend)" value={form.compType} onChange={e => set('compType', e.target.value)} />
            <input style={inputStyle()} type="email" placeholder="Your email (for status only — never published)" required value={form.submitterEmail} onChange={e => set('submitterEmail', e.target.value)} />

            {errors.length > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 14px', border: '1.5px solid var(--danger)', borderRadius: 2 }}>
                {errors.map((e, i) => (
                  <div key={i} style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: i < errors.length - 1 ? 4 : 0 }}>
                    · {e}
                  </div>
                ))}
              </div>
            )}
            {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <button type="submit" disabled={stage === 'sending'} style={{
              width: '100%', padding: '13px 26px', borderRadius: 2, border: 'none', cursor: 'pointer',
              background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
              fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '4px 4px 0 var(--shadow)',
            }}>
              {stage === 'sending' ? 'Submitting…' : 'Submit for review — free'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
