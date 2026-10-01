import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CTA_OPTIONS, createLaunch, listPages, uploadCreative, type Page } from '../lib/launch'

type Account = { id: string; workspace_id: string; name: string | null; meta_account_id: string; currency: string | null }
type Row = {
  key: string
  image_path: string | null
  preview: string | null
  fileName: string
  uploading: boolean
  headline: string
  primary_text: string
  link_url: string
  cta: string
}

const newRow = (link: string): Row => ({
  key: crypto.randomUUID(),
  image_path: null,
  preview: null,
  fileName: '',
  uploading: false,
  headline: '',
  primary_text: '',
  link_url: link,
  cta: 'LEARN_MORE',
})

export default function NewLaunch() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [pages, setPages] = useState<Page[]>([])
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [pageId, setPageId] = useState('')

  const [name, setName] = useState('')
  const [structure, setStructure] = useState<'adset_per_ad' | 'single_adset'>('adset_per_ad')
  const [budget, setBudget] = useState('')
  const [countries, setCountries] = useState('US')
  const [ageMin, setAgeMin] = useState('18')
  const [ageMax, setAgeMax] = useState('65')
  const [urlTags, setUrlTags] = useState('')
  const [defaultLink, setDefaultLink] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow('')])

  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const account = accounts.find((a) => a.id === accountId)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('ad_accounts')
      .select('id, workspace_id, name, meta_account_id, currency')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) return setErrors([error.message])
        setAccounts(data ?? [])
        if (data && data.length === 1) setAccountId(data[0].id)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    listPages(accountId)
      .then((p) => {
        if (cancelled) return
        setPages(p)
        setPagesError(null)
        setPageId((cur) => (p.some((x) => x.id === cur) ? cur : (p[0]?.id ?? '')))
      })
      .catch((e: Error) => {
        if (cancelled) return
        setPages([])
        setPagesError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [accountId])

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function onFile(key: string, file: File | undefined) {
    if (!file || !account) return
    updateRow(key, { uploading: true, fileName: file.name, preview: URL.createObjectURL(file), image_path: null })
    try {
      const path = await uploadCreative(account.workspace_id, file)
      updateRow(key, { uploading: false, image_path: path })
    } catch (e) {
      updateRow(key, { uploading: false, preview: null, fileName: '' })
      setErrors([e instanceof Error ? e.message : 'Upload failed.'])
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors([])
    if (!account) return setErrors(['Choose an ad account.'])
    if (rows.some((r) => r.uploading)) return setErrors(['Wait for the images to finish uploading.'])
    setBusy(true)
    try {
      const { job_id } = await createLaunch(account.id, {
        name,
        page_id: pageId,
        structure,
        daily_budget: Number(budget),
        countries: countries.split(',').map((c) => c.trim()).filter(Boolean),
        age_min: Number(ageMin),
        age_max: Number(ageMax),
        url_tags: urlTags,
        items: rows.map((r) => ({
          image_path: r.image_path,
          headline: r.headline,
          primary_text: r.primary_text,
          link_url: r.link_url,
          cta: r.cta,
        })),
      })
      navigate(`/launch/${job_id}`)
    } catch (err) {
      setErrors((err instanceof Error ? err.message : 'Something went wrong.').split('\n'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header>
        <strong>Meta Ads Automator</strong>
        <Link to="/">Back to dashboard</Link>
      </header>
      <main className="content">
        <h1>New launch</h1>
        <p className="muted">Everything is created paused in Meta. Nothing spends until you activate it.</p>

        <form onSubmit={onSubmit} className="stack">
          <section className="card">
            <h2>Campaign</h2>
            <label>
              Ad account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                <option value="">Choose...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.meta_account_id} ({a.currency})</option>
                ))}
              </select>
            </label>
            <label>
              Campaign name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required />
            </label>
            <label>
              Facebook Page
              <select value={pageId} onChange={(e) => setPageId(e.target.value)} required disabled={pages.length === 0}>
                {pages.length === 0 && <option value="">{accountId ? 'No Pages found' : 'Choose an account first'}</option>}
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            {pagesError && <p className="error">{pagesError}</p>}
            <p className="muted">Objective: Traffic (website visits). More objectives come later.</p>
          </section>

          <section className="card">
            <h2>Budget and audience</h2>
            <label>
              Daily budget per ad set{account?.currency ? ` (${account.currency})` : ''}
              <input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} required />
            </label>
            <fieldset>
              <legend>Structure</legend>
              <label className="inline">
                <input type="radio" checked={structure === 'adset_per_ad'} onChange={() => setStructure('adset_per_ad')} />
                One ad set per ad (each ad gets its own budget)
              </label>
              <label className="inline">
                <input type="radio" checked={structure === 'single_adset'} onChange={() => setStructure('single_adset')} />
                All ads in one ad set (one shared budget)
              </label>
            </fieldset>
            <label>
              Countries (two-letter codes, comma separated)
              <input value={countries} onChange={(e) => setCountries(e.target.value)} required />
            </label>
            <div className="two">
              <label>
                Minimum age
                <input type="number" min="13" max="65" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
              </label>
              <label>
                Maximum age
                <input type="number" min="13" max="65" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
              </label>
            </div>
            <label>
              URL parameters (optional)
              <input
                value={urlTags}
                onChange={(e) => setUrlTags(e.target.value)}
                placeholder="utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}"
              />
            </label>
          </section>

          <section className="card">
            <h2>Ads</h2>
            <label>
              Default link for new ads
              <input
                type="url"
                value={defaultLink}
                onChange={(e) => setDefaultLink(e.target.value)}
                placeholder="https://yourwebsite.com/offer"
              />
            </label>
            {rows.map((r, i) => (
              <div key={r.key} className="row-card">
                <div className="row-head">
                  <strong>Ad {i + 1}</strong>
                  {rows.length > 1 && (
                    <button type="button" className="link" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="creative">
                  {r.preview && <img src={r.preview} alt="" className="thumb" />}
                  <label>
                    Image (PNG, JPG or WebP, up to 10 MB)
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(r.key, e.target.files?.[0])} />
                  </label>
                </div>
                {r.uploading && <p className="muted">Uploading {r.fileName}...</p>}
                {r.image_path && <p className="notice">Uploaded.</p>}
                <label>
                  Headline
                  <input value={r.headline} maxLength={255} onChange={(e) => updateRow(r.key, { headline: e.target.value })} />
                </label>
                <label>
                  Primary text
                  <textarea value={r.primary_text} maxLength={2000} rows={3} onChange={(e) => updateRow(r.key, { primary_text: e.target.value })} />
                </label>
                <div className="two">
                  <label>
                    Link
                    <input type="url" value={r.link_url} onChange={(e) => updateRow(r.key, { link_url: e.target.value })} required />
                  </label>
                  <label>
                    Button
                    <select value={r.cta} onChange={(e) => updateRow(r.key, { cta: e.target.value })}>
                      {CTA_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => setRows((rs) => [...rs, newRow(defaultLink)])} disabled={rows.length >= 50}>
              Add another ad
            </button>
          </section>

          {errors.length > 0 && (
            <div className="card error-box" role="alert">
              {errors.map((m, i) => (
                <p key={i} className="error">{m}</p>
              ))}
            </div>
          )}

          <button type="submit" disabled={busy || rows.some((r) => r.uploading)}>
            {busy ? 'Checking with Meta...' : 'Review launch'}
          </button>
        </form>
      </main>
    </div>
  )
}
