import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'

interface AuthModalProps {
  onClose: () => void
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const err = await signUp(email, password, username)
        if (err) {
          setError(err)
        } else {
          setInfo(
            'Account created. If email confirmation is enabled, check your inbox before logging in.',
          )
          setMode('login')
        }
      } else {
        const err = await signIn(email, password)
        if (err) setError(err)
        else onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="form-stack">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-username">Username (public)</label>
              <input
                id="auth-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-24 letters, numbers, underscores"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]{3,24}"
                autoComplete="username"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          {info && <p className="form-info">{info}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="modal-switch">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('login')}>
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
