'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/platform/supabase'
import { Modal, ModalHeader, modalInputStyle, ModalSubmitButton, ModalError } from '@/components/ui/Modal'

const TYPES = ['Dating', 'Friendship', 'Co-founder', 'Wedding', 'Still Figuring Out']
const CONTACT_TYPES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone number' },
  { value: 'instagram', label: 'Instagram handle' },
  { value: 'telegram', label: 'Telegram username' },
  { value: 'email', label: 'Email address' },
]

function maxDOB() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().split('T')[0]
}

/**
 * The real signup — same two existing Match endpoints the full
 * /account/register + /match/interview flow uses (register, then
 * profile/save), just the minimum required subset of fields instead of
 * the full demographic form, and one combined "about you" line standing
 * in for the 5-question interview. A real account and a real, matchable
 * profile come out the other end — nothing here is stubbed or fake, it's
 * just shorter. Anyone who wants to add height/profession/preferences/etc.
 * can do that from their dashboard afterward (same place the full flow
 * sends them).
 */
export function FindYourPersonModal({ opportunityTitle, onClose }: { opportunityTitle: string; onClose: () => void }) {
  const [checkingRegion, setCheckingRegion] = useState(true)
  const [outsideIndia, setOutsideIndia] = useState(false)
  const [sharedSession, setSharedSession] = useState<{ accessToken: string; email: string } | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [city, setCity] = useState('')
  const [contactType, setContactType] = useState('whatsapp')
  const [contact, setContact] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [about, setAbout] = useState('')

  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error' | 'accountCreatedProfileFailed'>('idle')
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  // Set once the account itself exists (either just-created, or an
  // existing shared session) — kept around so a failed profile/save can be
  // retried directly without re-submitting the whole form, which would
  // otherwise hit "an account with this email already exists" on retry.
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('https://ipapi.co/country/')
      .then(r => r.text())
      .then(country => { if (country.trim() !== 'IN') setOutsideIndia(true) })
      .catch(() => { /* fail open — the server enforces this either way */ })
      .finally(() => setCheckingRegion(false))

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && session.user.email) {
        setSharedSession({ accessToken: session.access_token, email: session.user.email })
        setEmail(session.user.email)
      }
    })
  }, [])

  /** The second step alone — split out so a failed save can be retried
   * directly with the access token we already have, without re-submitting
   * the whole form (which would 409 on "account already exists" the
   * moment an account was actually created). */
  async function saveProfile(accessToken: string) {
    setRetrying(true)
    try {
      const saveRes = await fetch('/api/match/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          lookingFor, contact, contactType,
          profileJson: { about: about || `Found via OppIDX — chasing "${opportunityTitle}".` },
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) {
        setPendingAccessToken(accessToken)
        setError(saveData.error || 'Could not save your profile.')
        setState('accountCreatedProfileFailed')
        return
      }
      setState('done')
    } catch {
      setPendingAccessToken(accessToken)
      setError('Something went wrong saving your profile. Try again.')
      setState('accountCreatedProfileFailed')
    } finally {
      setRetrying(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!lookingFor) { setError('Tell us what you’re looking for.'); return }
    if (!contact) { setError('We need a way for your match to reach you.'); return }
    if (!dob) { setError('We need your date of birth.'); return }
    if (!sharedSession && !password) { setError('Choose a password.'); return }
    setState('sending')
    try {
      const registerRes = await fetch('/api/match/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sharedSession ? { Authorization: `Bearer ${sharedSession.accessToken}` } : {}),
        },
        body: JSON.stringify({ name, email, password, dob, city, lookingFor }),
      })
      const registerData = await registerRes.json()
      if (!registerRes.ok) { setError(registerData.error || 'Registration failed.'); setState('error'); return }

      let accessToken = sharedSession?.accessToken
      if (!sharedSession) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError || !signInData.session) {
          // The account is real at this point — steer them to a manual
          // login instead of letting them hit "submit" again, which would
          // now 409 on "account already exists".
          setError('Account created, but we couldn’t log you in automatically.')
          setState('accountCreatedProfileFailed')
          return
        }
        accessToken = signInData.session.access_token
      }

      await saveProfile(accessToken!)
    } catch {
      setError('Something went wrong. Try again.')
      setState('error')
    }
  }

  return (
    <Modal onClose={onClose}>
      {checkingRegion ? (
        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Checking…</div>
      ) : outsideIndia ? (
        <>
          <ModalHeader title="India only — for now." onClose={onClose} />
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>
            OppIDX Match is currently open for registration in India only. We&apos;re starting here, doing it right, and expanding when the time is right.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 20 }}>
            You can still explore the app and check compatibility.
          </p>
          <Link href="/match/compatibility" onClick={onClose} style={{ fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>Check compatibility →</Link>
        </>
      ) : state === 'done' ? (
        <>
          <ModalHeader title="You're in." onClose={onClose} />
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 18 }}>
            You&apos;re in the pool for this Friday&apos;s match. Want to add more detail — photos, preferences, a real interview answer instead of the placeholder? Finish it from your dashboard any time.
          </p>
          <Link href="/account/dashboard" onClick={onClose} style={{
            display: 'inline-block', padding: '10px 20px', borderRadius: 2,
            background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
          }}>Go to your dashboard →</Link>
        </>
      ) : state === 'accountCreatedProfileFailed' ? (
        <>
          <ModalHeader title="Your account is set up." onClose={onClose} />
          <ModalError>{error}</ModalError>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 18 }}>
            {pendingAccessToken
              ? 'Your account exists — just the last step (saving your profile) didn’t go through. Try again:'
              : 'Log in and your dashboard will pick up right where this left off.'}
          </p>
          {pendingAccessToken ? (
            <ModalSubmitButton type="button" disabled={retrying} onClick={() => saveProfile(pendingAccessToken)}>
              {retrying ? 'Retrying…' : 'Retry saving your profile →'}
            </ModalSubmitButton>
          ) : (
            <Link href="/account" onClick={onClose} style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 2,
              background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
            }}>Log in →</Link>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <ModalHeader title="Find your person" subtitle={`Chasing "${opportunityTitle}" too? Get matched — real accounts only, never a browsable list.`} onClose={onClose} />

          <input style={modalInputStyle()} placeholder="Your name" required value={name} onChange={e => setName(e.target.value)} />
          <input style={modalInputStyle()} type="email" placeholder="Email" required disabled={!!sharedSession} value={email} onChange={e => setEmail(e.target.value)} />
          {!sharedSession && (
            <input style={modalInputStyle()} type="password" placeholder="Password (8+ characters)" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...modalInputStyle(), flex: 1 }} type="date" required max={maxDOB()} value={dob} onChange={e => setDob(e.target.value)} title="Date of birth (18+)" />
            <input style={{ ...modalInputStyle(), flex: 1 }} placeholder="City" required value={city} onChange={e => setCity(e.target.value)} />
          </div>

          <select style={modalInputStyle()} required value={lookingFor} onChange={e => setLookingFor(e.target.value)}>
            <option value="">I&apos;m looking for —</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 10 }}>
            <select style={{ ...modalInputStyle(), flex: '0 0 140px' }} value={contactType} onChange={e => setContactType(e.target.value)}>
              {CONTACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input style={{ ...modalInputStyle(), flex: 1 }} placeholder="Your contact — encrypted, only shared with a confirmed match" required value={contact} onChange={e => setContact(e.target.value)} />
          </div>

          <textarea style={{ ...modalInputStyle(), minHeight: 60, resize: 'vertical' }} placeholder="One line about you (optional — you can go deeper from your dashboard)" value={about} onChange={e => setAbout(e.target.value)} maxLength={280} />

          <ModalError>{error}</ModalError>

          <ModalSubmitButton type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Joining…' : 'Join & get matched →'}
          </ModalSubmitButton>

          <p style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 12, lineHeight: 1.5 }}>
            18+. By joining you agree to <Link href="/match/terms" style={{ color: 'var(--ink-3)' }}>OppIDX Match&apos;s Terms</Link>. Matches run once a week, this Friday.
          </p>
        </form>
      )}
    </Modal>
  )
}
