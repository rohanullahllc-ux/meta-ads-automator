import { callFunction } from './api'
import { supabase } from './supabase'

export const CTA_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['LEARN_MORE', 'Learn more'],
  ['SHOP_NOW', 'Shop now'],
  ['SIGN_UP', 'Sign up'],
  ['SUBSCRIBE', 'Subscribe'],
  ['CONTACT_US', 'Contact us'],
  ['GET_QUOTE', 'Get quote'],
  ['DOWNLOAD', 'Download'],
  ['APPLY_NOW', 'Apply now'],
  ['ORDER_NOW', 'Order now'],
  ['BOOK_TRAVEL', 'Book now'],
]

export type Page = { id: string; name: string }

export type LaunchSettingsView = {
  campaign_name: string
  structure: 'adset_per_ad' | 'single_adset'
  countries: string[]
  age_min: number
  age_max: number
  page_id: string
  display: { daily_budget: string; total_daily_budget: string; ad_sets: number; ads: number }
}

export type LaunchJob = {
  id: string
  name: string
  status: 'ready' | 'running' | 'partial' | 'failed' | 'done' | 'undone'
  settings: LaunchSettingsView
  warnings: string[]
  error: string | null
  meta_campaign_id: string | null
  ad_account_id: string
  created_at: string
}

export type LaunchItem = {
  id: string
  position: number
  ad_name: string
  headline: string | null
  link_url: string
  status: 'pending' | 'done' | 'failed' | 'undone'
  error: string | null
  meta_ad_id: string | null
}

export type LaunchSummary = {
  status: string
  done: number
  failed: number
  pending: number
  rate_limited: boolean
  fatal: string | null
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export async function uploadCreative(workspaceId: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use a PNG, JPG or WebP image.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 10 MB or smaller.')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('creatives').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export const listPages = (adAccountId: string) =>
  callFunction<{ pages: Page[] }>('meta-list-pages', { ad_account_id: adAccountId }).then((r) => r.pages)

export const createLaunch = (adAccountId: string, input: Record<string, unknown>) =>
  callFunction<{ job_id: string; warnings: string[] }>('launch-create', { ad_account_id: adAccountId, input })

export const undoLaunch = (jobId: string) =>
  callFunction<{ status: string; problems: string[] }>('launch-undo', { job_id: jobId })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Calls the server in small batches until every ad is processed, a blocking error appears, or Meta rate limits. */
export async function runUntilDone(
  jobId: string,
  opts: { retryFailed?: boolean; onProgress?: (s: LaunchSummary) => void } = {},
): Promise<LaunchSummary> {
  let retry = opts.retryFailed ?? false
  for (let i = 0; i < 100; i++) {
    const summary = await callFunction<LaunchSummary>('launch-run', { job_id: jobId, retry_failed: retry })
    retry = false
    opts.onProgress?.(summary)
    if (summary.fatal || summary.pending === 0) return summary
    if (summary.rate_limited) await sleep(30_000)
  }
  throw new Error('This launch is taking longer than expected. Open it again to continue.')
}
