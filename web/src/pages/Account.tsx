import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/authContext'

export default function Account() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  return (
    <div className="shell">
      <header>
        <strong>Meta Ads Automator</strong>
        <Link to="/">Back to dashboard</Link>
      </header>
      <main className="content stack">
        <h1>Account</h1>
        <section className="card">
          <h2>Change password</h2>
          <p className="muted">Signed in as {session?.user.email}</p>
          <form onSubmit={onSubmit} className="stack">
            <label>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            {done && <p className="notice">Password changed.</p>}
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
          </form>
        </section>
      </main>
    </div>
  )
}
