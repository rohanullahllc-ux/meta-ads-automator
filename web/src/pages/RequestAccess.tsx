import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { callFunction } from '../lib/api'

// Public form for the private beta. Requests are reviewed by the owner in the Admin page.
export default function RequestAccess() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [profile, setProfile] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot: hidden from people, bots fill it in
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await callFunction('access-request', { name, email, company, facebook_profile: profile, message, website })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <main className="auth-page">
        <div className="card">
          <h1>Request received</h1>
          <p>Thank you. We will review your request and email you at {email} if we can offer you a place in the private beta.</p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <form className="card" onSubmit={onSubmit}>
        <h1>Request access</h1>
        <p className="muted">Ads Automator is in a private beta. Tell us a little about you.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoComplete="name" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required autoComplete="email" />
        </label>
        <label>
          Company or agency (optional)
          <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={150} />
        </label>
        <label>
          Your Facebook profile link (optional)
          <input value={profile} onChange={(e) => setProfile(e.target.value)} maxLength={300} placeholder="https://facebook.com/..." />
        </label>
        <label>
          What do you advertise, and how many ad accounts do you manage? (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} />
        </label>
        {/* Honeypot. Hidden from people and screen readers. */}
        <div className="hp" aria-hidden="true">
          <label>
            Website
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send request'}</button>
        <p className="muted legal-links">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  )
}
