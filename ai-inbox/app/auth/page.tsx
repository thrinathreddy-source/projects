'use client'

import { useState, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Wordmark } from '@/components/ui/Wordmark'

type Mode = 'login' | 'register'

function AuthForm() {
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? '/admin'

  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return }
    if (mode === 'register' && !name.trim()) { setError('Please enter your name.'); return }
    if (mode === 'register' && !setupToken.trim()) { setError('Please enter the setup token.'); return }

    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body     = mode === 'login'
        ? { email: email.trim(), password }
        : { name: name.trim(), email: email.trim(), password, setupToken: setupToken.trim() }

      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        setLoading(false)
        return
      }

      window.location.href = from
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 2,
    background: 'var(--board)', border: '1.5px solid var(--line)',
    color: 'var(--ink)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--font-mono)',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="card-box"
        style={{ width: '100%', maxWidth: 400, padding: '38px 32px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <Image src="/logo.png" alt="OppIDX" width={44} height={44} style={{ display: 'block' }} />
          <Wordmark size={24} />
        </div>

        <div style={{ display: 'flex', background: 'rgba(43,38,32,0.06)', borderRadius: 6, padding: 4, marginBottom: 24 }}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1, padding: '8px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: mode === m ? 'var(--btn-bg)' : 'transparent',
                color: mode === m ? 'var(--btn-text)' : 'var(--ink-2)',
                transition: 'all 0.18s',
              }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--ink)', marginBottom: 4 }}>
              {mode === 'login' ? 'Admin sign in' : 'Create the admin account'}
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 22 }}>
              {mode === 'login' ? 'For managing the opportunity board.' : 'One account manages the whole board.'}
            </p>
          </motion.div>
        </AnimatePresence>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} style={field} autoComplete="name" />
          )}
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={field} autoComplete="email" />
          <input type="password" placeholder={mode === 'register' ? 'Password (min 8 chars)' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} style={field} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && (
            <input type="password" placeholder="Setup token" value={setupToken} onChange={e => setSetupToken(e.target.value)} style={field} autoComplete="off" />
          )}

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ fontSize: 12.5, color: 'var(--danger)', padding: '9px 12px', borderRadius: 2, background: 'rgba(182,57,44,0.08)', border: '1px solid rgba(182,57,44,0.3)', fontFamily: 'var(--font-mono)' }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 2, border: 'none', marginTop: 4,
              background: 'var(--btn-bg)', opacity: loading ? 0.6 : 1,
              color: 'var(--btn-text)', fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
              cursor: loading ? 'default' : 'pointer',
              transition: 'all 0.15s',
              boxShadow: '3px 3px 0 var(--shadow)',
            }}>
            {loading
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </motion.button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>← Back to the board</Link>
        </div>
      </motion.div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  )
}
