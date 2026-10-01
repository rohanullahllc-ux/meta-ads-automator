import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { startMetaConnect } from '../lib/meta'
import { useAuth } from '../auth/authContext'

type Workspace = { id: string; name: string }
type AdAccount = {
  id: string
  meta_account_id: string
  name: string | null
  currency: string | null
  timezone_name: string | null
  has_payment_method: boolean | null
}
type RecentLaunch = { id: string; name: string; status: string; created_at: string }

export default function Dashboard() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [launches, setLaunches] = useState<RecentLaunch[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const justConnected = params.get('meta') === 'connected'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const ws = await supabase.from('workspaces').select('id, name').limit(1).maybeSingle()
      if (cancelled) return
      if (ws.error) return setError(ws.error.message)
      setWorkspace(ws.data)
      const acc = await supabase
        .from('ad_accounts')
        .select('id, meta_account_id, name, currency, timezone_name, has_payment_method')
        .order('name')
      if (cancelled) return
      if (acc.error) return setError(acc.error.message)
      setAccounts(acc.data ?? [])
      const jobs = await supabase
        .from('launch_jobs')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (cancelled) return
      if (!jobs.error) setLaunches(jobs.data ?? [])
      const adm = await supabase.from('platform_admins').select('user_id').maybeSingle()
      if (cancelled) return
      setIsAdmin(!adm.error && !!adm.data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [justConnected])

  async function connect() {
    setConnecting(true)
    setError(null)
    try {
      await startMetaConnect() // navigates away to Facebook on success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Meta connection.')
      setConnecting(false)
    }
  }

  return (
    <div className="shell">
      <header>
        <strong>Meta Ads Automator</strong>
        <span>
          {session?.user.email}
          {isAdmin && <Link to="/admin" className="header-link">Admin</Link>}
          <Link to="/account" className="header-link">Account</Link>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </span>
      </header>
      <main className="content">
        <h1>{workspace ? `Workspace: ${workspace.name}` : 'Loading workspace...'}</h1>
        {justConnected && (
          <p className="notice banner">
            Meta account connected.{' '}
            <button className="link" onClick={() => setParams({}, { replace: true })}>Dismiss</button>
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <section className="card">
          <h2>Ad accounts</h2>
          {accounts.length === 0 ? (
            <p>No Meta account connected yet.</p>
          ) : (
            <ul className="account-list">
              {accounts.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.name ?? a.meta_account_id}</strong>
                    <div className="muted">
                      {a.meta_account_id} · {a.currency ?? '?'} · {a.timezone_name ?? 'timezone unknown'}
                    </div>
                  </div>
                  {a.has_payment_method === false && (
                    <span className="badge warn" title="Meta will not create ads until billing is added in Ads Manager">
                      No payment method
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button onClick={connect} disabled={connecting || !workspace}>
            {connecting ? 'Redirecting to Meta...' : accounts.length ? 'Reconnect Meta account' : 'Connect Meta account'}
          </button>
        </section>

        <section className="card">
          <h2>Launches</h2>
          {accounts.length === 0 ? (
            <p className="muted">Connect a Meta account to create launches.</p>
          ) : (
            <>
              {launches.length === 0 ? (
                <p>No launches yet.</p>
              ) : (
                <ul className="account-list">
                  {launches.map((l) => (
                    <li key={l.id}>
                      <div>
                        <Link to={`/launch/${l.id}`}><strong>{l.name}</strong></Link>
                        <div className="muted">{new Date(l.created_at).toLocaleString()}</div>
                      </div>
                      <span className={`badge status-${l.status}`}>{l.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/launch/new" className="button">New launch</Link>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
