import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/api'

type Req = {
  id: string
  name: string
  email: string
  company: string | null
  facebook_profile: string | null
  message: string | null
  status: 'new' | 'approved' | 'declined'
  created_at: string
}
type Created = { email: string; temp_password: string }

type Loaded = { isAdmin: false } | { isAdmin: true; requests: Req[]; error: string | null }

async function fetchAdmin(): Promise<Loaded> {
  const me = await supabase.from('platform_admins').select('user_id').maybeSingle()
  if (me.error || !me.data) return { isAdmin: false }
  const r = await supabase
    .from('access_requests')
    .select('id, name, email, company, facebook_profile, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  return { isAdmin: true, requests: (r.data ?? []) as Req[], error: r.error?.message ?? null }
}

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<Req[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const apply = useCallback((r: Loaded) => {
    setIsAdmin(r.isAdmin)
    if (r.isAdmin) {
      setRequests(r.requests)
      if (r.error) setError(r.error)
    }
  }, [])

  const load = useCallback(async () => apply(await fetchAdmin()), [apply])

  useEffect(() => {
    let cancelled = false
    fetchAdmin().then((r) => {
      if (!cancelled) apply(r)
    })
    return () => {
      cancelled = true
    }
  }, [apply])

  async function create(targetEmail: string, requestId?: string) {
    setBusy(requestId ?? 'manual')
    setError(null)
    setCreated(null)
    setCopied(false)
    try {
      const r = await callFunction<{ email: string; temp_password: string }>('admin-create-client', {
        email: targetEmail,
        request_id: requestId,
      })
      setCreated({ email: r.email, temp_password: r.temp_password })
      setEmail('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  function loginDetails(c: Created) {
    return [
      `Sign in at: ${window.location.origin}/login`,
      `Email: ${c.email}`,
      `Temporary password: ${c.temp_password}`,
      '',
      'Please change your password after signing in (Account page). Getting started guide: ' + `${window.location.origin}/guide`,
    ].join('\n')
  }

  async function copy(c: Created) {
    try {
      await navigator.clipboard.writeText(loginDetails(c))
      setCopied(true)
    } catch {
      setError('Could not copy automatically. Select the text and copy it by hand.')
    }
  }

  if (isAdmin === null) return <p className="center">Loading...</p>
  if (!isAdmin) {
    return (
      <div className="shell">
        <main className="content">
          <h1>Not allowed</h1>
          <p>This page is only for the account owner.</p>
          <Link to="/">Back to dashboard</Link>
        </main>
      </div>
    )
  }

  const open = requests.filter((r) => r.status === 'new')
  const done = requests.filter((r) => r.status !== 'new')

  return (
    <div className="shell">
      <header>
        <strong>Meta Ads Automator · Admin</strong>
        <Link to="/">Back to dashboard</Link>
      </header>
      <main className="content stack">
        <h1>Clients</h1>
        {error && <div className="card error-box" role="alert"><p className="error">{error}</p></div>}

        {created && (
          <section className="card">
            <h2>Account created</h2>
            <p className="notice">Copy these details now. The password is shown only once and is not stored.</p>
            <pre className="creds">{loginDetails(created)}</pre>
            <button onClick={() => copy(created)}>{copied ? 'Copied' : 'Copy login details'}</button>
          </section>
        )}

        <section className="card">
          <h2>Create a client account</h2>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              create(email)
            }}
          >
            <label>
              Client email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit" disabled={busy !== null}>{busy === 'manual' ? 'Creating...' : 'Create account'}</button>
          </form>
        </section>

        <section className="card">
          <h2>Access requests ({open.length} new)</h2>
          {open.length === 0 && <p className="muted">No new requests.</p>}
          <ul className="account-list">
            {open.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.name}</strong> · {r.email}
                  {r.company && <div className="muted">{r.company}</div>}
                  {r.facebook_profile && <div className="muted">{r.facebook_profile}</div>}
                  {r.message && <div className="muted">{r.message}</div>}
                  <div className="muted">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <button onClick={() => create(r.email, r.id)} disabled={busy !== null}>
                  {busy === r.id ? 'Creating...' : 'Create account'}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {done.length > 0 && (
          <section className="card">
            <h2>Handled</h2>
            <ul className="account-list">
              {done.map((r) => (
                <li key={r.id}>
                  <div>{r.name} · {r.email}</div>
                  <span className={`badge status-${r.status === 'approved' ? 'done' : 'failed'}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
