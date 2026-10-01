// Minimal Meta Graph API client. All Meta calls in the app should go through this module,
// so the API version is pinned in one place.
import { HttpError } from './http.ts'
import type { MetaErrorInfo } from './launch.ts'

export const graphVersion = () => Deno.env.get('META_GRAPH_VERSION') ?? 'v25.0'
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`

/** A failed Graph call. `info` keeps Meta's codes so callers can react (retry, stop, explain). */
export class MetaApiError extends HttpError {
  info: MetaErrorInfo
  constructor(info: MetaErrorInfo) {
    super(502, `Meta rejected the request: ${info.userMessage ?? info.message ?? 'unknown error'}`)
    this.info = info
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.error) {
    const e = body?.error ?? {}
    // Log codes and messages only. Never log URLs, bodies or tokens.
    console.error('Meta API error', res.status, e.code, e.error_subcode, e.message)
    throw new MetaApiError({
      code: e.code,
      subcode: e.error_subcode,
      message: e.message ?? `HTTP ${res.status}`,
      userMessage: e.error_user_msg,
      userTitle: e.error_user_title,
    })
  }
  return body as T
}

/** Authenticated GET. The token travels in a header, not the URL. */
export async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${graphBase()}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return parse<T>(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }))
}

/** Authenticated POST with a JSON body (used to create and update Meta objects). */
export async function graphPost<T>(path: string, token: string, body: Record<string, unknown>): Promise<T> {
  return parse<T>(
    await fetch(`${graphBase()}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function graphDelete<T>(path: string, token: string): Promise<T> {
  return parse<T>(await fetch(`${graphBase()}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }))
}

/** Uploads an image to the ad account's library and returns its hash. Meta de-duplicates identical files. */
export async function graphUploadImage(accountId: string, token: string, file: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('filename', file, filename)
  const res = await parse<{ images: Record<string, { hash: string }> }>(
    await fetch(`${graphBase()}/${accountId}/adimages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }),
  )
  const hash = Object.values(res.images ?? {})[0]?.hash
  if (!hash) throw new HttpError(502, 'Meta did not return an image hash.')
  return hash
}

/** GET for the OAuth token endpoints, which authenticate with the app id and secret instead. */
export async function graphGetOAuth<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${graphBase()}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return parse<T>(await fetch(url))
}

export type MetaAdAccount = {
  id: string // "act_123..."
  name?: string
  currency?: string
  timezone_name?: string
  account_status?: number
  min_daily_budget?: number | string
  // Deliberately not requested: Meta returns a funding_source id even for accounts where ad creation fails
  // with "No payment method" (verified 2026-10-01). Billing readiness is detected with a dry-run ad instead.
}

/** All ad accounts the user can access (capped at 500 to bound a single request). */
export async function fetchAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const out: MetaAdAccount[] = []
  let after: string | undefined
  for (let page = 0; page < 5; page++) {
    const res = await graphGet<{ data: MetaAdAccount[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      '/me/adaccounts',
      token,
      {
        fields: 'id,name,currency,timezone_name,account_status,min_daily_budget',
        limit: '100',
        ...(after ? { after } : {}),
      },
    )
    out.push(...res.data)
    after = res.paging?.cursors?.after
    if (!res.paging?.next || !after) break
  }
  return out
}
