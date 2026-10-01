import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { runUntilDone, undoLaunch, type LaunchItem, type LaunchJob } from '../lib/launch'

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready to create',
  running: 'Creating...',
  partial: 'Partly created',
  failed: 'Stopped',
  done: 'Created (paused)',
  undone: 'Undone',
  pending: 'Waiting',
}

type Loaded =
  | { error: string }
  | { error?: undefined; job: LaunchJob; items: LaunchItem[]; metaAccountId: string | null }

async function fetchLaunch(id: string): Promise<Loaded> {
  const j = await supabase.from('launch_jobs').select('*').eq('id', id).maybeSingle()
  if (j.error) return { error: j.error.message }
  if (!j.data) return { error: 'Launch not found.' }
  const it = await supabase
    .from('launch_items')
    .select('id, position, ad_name, headline, link_url, status, error, meta_ad_id')
    .eq('job_id', id)
    .order('position')
  if (it.error) return { error: it.error.message }
  const acc = await supabase.from('ad_accounts').select('meta_account_id').eq('id', j.data.ad_account_id).maybeSingle()
  return {
    job: j.data as LaunchJob,
    items: (it.data ?? []) as LaunchItem[],
    metaAccountId: acc.data?.meta_account_id ?? null,
  }
}

export default function LaunchDetail() {
  const { id } = useParams()
  const [job, setJob] = useState<LaunchJob | null>(null)
  const [items, setItems] = useState<LaunchItem[]>([])
  const [metaAccountId, setMetaAccountId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'run' | 'undo' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((r: Loaded) => {
    if (r.error !== undefined) return setError(r.error)
    setJob(r.job)
    setItems(r.items)
    setMetaAccountId(r.metaAccountId)
  }, [])

  const reload = useCallback(async () => {
    if (id) apply(await fetchLaunch(id))
  }, [id, apply])

  useEffect(() => {
    let cancelled = false
    if (id) {
      fetchLaunch(id).then((r) => {
        if (!cancelled) apply(r)
      })
    }
    return () => {
      cancelled = true
    }
  }, [id, apply])

  async function run(retryFailed = false) {
    if (!job) return
    setBusy('run')
    setError(null)
    setMessage('Starting...')
    try {
      const summary = await runUntilDone(job.id, {
        retryFailed,
        onProgress: (s) => {
          setMessage(`${s.done} created, ${s.failed} failed, ${s.pending} left...`)
          reload()
        },
      })
      setMessage(summary.fatal ? null : `Finished: ${summary.done} created, ${summary.failed} failed.`)
      if (summary.fatal) setError(summary.fatal)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setMessage(null)
    } finally {
      setBusy(null)
      await reload()
    }
  }

  async function undo() {
    if (!job) return
    if (!window.confirm('Delete everything this launch created in Meta? This cannot be undone.')) return
    setBusy('undo')
    setError(null)
    try {
      const r = await undoLaunch(job.id)
      setMessage(r.problems.length ? null : 'Everything this launch created has been removed from Meta.')
      if (r.problems.length) setError(`Some objects could not be removed: ${r.problems.join(' | ')}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
      await reload()
    }
  }

  if (!job) {
    return (
      <div className="shell">
        <main className="content">
          {error ? <p className="error" role="alert">{error}</p> : <p>Loading...</p>}
          <Link to="/">Back to dashboard</Link>
        </main>
      </div>
    )
  }

  const pending = items.filter((i) => i.status === 'pending').length
  const failed = items.filter((i) => i.status === 'failed').length
  const canRun = ['ready', 'running', 'partial', 'failed'].includes(job.status) && (job.status === 'ready' || pending > 0)
  const canRetry = failed > 0 && ['partial', 'failed'].includes(job.status)
  const canUndo = ['ready', 'partial', 'failed', 'done'].includes(job.status)
  const numericAccount = metaAccountId?.replace(/^act_/, '')
  const adsManagerUrl =
    numericAccount && job.meta_campaign_id
      ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${numericAccount}&selected_campaign_ids=${job.meta_campaign_id}`
      : null
  const s = job.settings

  return (
    <div className="shell">
      <header>
        <strong>Meta Ads Automator</strong>
        <Link to="/">Back to dashboard</Link>
      </header>
      <main className="content stack">
        <div>
          <h1>{job.name}</h1>
          <span className={`badge status-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
        </div>

        <section className="card">
          <h2>Summary</h2>
          <ul className="plain">
            <li><strong>{s.display.ads}</strong> ads in <strong>{s.display.ad_sets}</strong> ad set{s.display.ad_sets === 1 ? '' : 's'}</li>
            <li>Daily budget: <strong>{s.display.daily_budget}</strong> per ad set, <strong>{s.display.total_daily_budget}</strong> in total once active</li>
            <li>Countries: {s.countries.join(', ')} · Ages {s.age_min}-{s.age_max}</li>
          </ul>
          <p className="muted">Everything is created <strong>paused</strong>. Nothing will spend until you activate it in Meta Ads Manager.</p>
          {job.warnings.length > 0 && (
            <ul className="plain warn-list">
              {job.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </section>

        {error && <div className="card error-box" role="alert"><p className="error">{error}</p></div>}
        {message && <p className="notice">{message}</p>}

        <div className="actions">
          {canRun && (
            <button onClick={() => run(false)} disabled={busy !== null}>
              {busy === 'run' ? 'Working...' : job.status === 'ready' ? 'Create in Meta (paused)' : 'Continue'}
            </button>
          )}
          {canRetry && (
            <button className="secondary" onClick={() => run(true)} disabled={busy !== null}>Retry failed ads</button>
          )}
          {adsManagerUrl && <a href={adsManagerUrl} target="_blank" rel="noreferrer">Open in Ads Manager</a>}
          {canUndo && (
            <button className="danger" onClick={undo} disabled={busy !== null}>
              {busy === 'undo' ? 'Removing...' : 'Undo launch'}
            </button>
          )}
        </div>

        <section className="card">
          <h2>Ads</h2>
          <table>
            <thead>
              <tr><th>#</th><th>Ad</th><th>Link</th><th>Status</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.position}</td>
                  <td>{i.headline || i.ad_name}</td>
                  <td className="clip">{i.link_url}</td>
                  <td>
                    <span className={`badge status-${i.status}`}>{STATUS_LABEL[i.status] ?? i.status}</span>
                    {i.error && <div className="error small">{i.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
