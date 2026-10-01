// Creates a launch in Meta, a few ads per call. The web app calls this repeatedly until nothing is pending.
//
// Safety properties:
//  - Everything is created PAUSED (see _shared/launch.ts). This function never activates anything.
//  - Every Meta id is saved the moment the object exists, so a crash or retry resumes instead of duplicating.
//  - A lock stops two runs of the same job at once.
//  - Billing/permission/login errors stop the job early with a plain-English message instead of failing every ad.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { audit, loadAccountContext } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import {
  adParams, adSetParams, campaignParams, classifyMetaError, creativeParams,
  type Cta, type LaunchSettings, type PlannedItem,
} from '../_shared/launch.ts'
import { graphPost, graphUploadImage, MetaApiError } from '../_shared/meta.ts'

const BATCH = 4 // ads per call
const DEADLINE_MS = 90_000 // stop starting new ads after this long
const LOCK_MS = 150_000

type Item = PlannedItem & {
  id: string
  cta: Cta
  image_hash: string | null
  meta_adset_id: string | null
  meta_creative_id: string | null
  meta_ad_id: string | null
  attempts: number
}

type Summary = {
  status: string
  done: number
  failed: number
  pending: number
  rate_limited: boolean
  fatal: string | null
}

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const user = await requireUser(req, admin)

    const body = await req.json().catch(() => ({}))
    const jobId = body?.job_id
    if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new HttpError(400, 'Missing launch id.')

    const { data: job, error } = await admin.from('launch_jobs').select('*').eq('id', jobId).maybeSingle()
    if (error) throw error
    if (!job) throw new HttpError(404, 'Launch not found.')
    const ctx = await loadAccountContext(admin, user.id, job.ad_account_id) // also checks edit permission
    if (!['ready', 'running', 'partial', 'failed'].includes(job.status)) {
      throw new HttpError(409, `This launch is already ${job.status}.`)
    }

    const now = new Date()
    const { data: locked, error: lockError } = await admin
      .from('launch_jobs')
      .update({
        status: 'running',
        locked_until: new Date(now.getTime() + LOCK_MS).toISOString(),
        started_at: job.started_at ?? now.toISOString(),
        error: null,
      })
      .eq('id', job.id)
      .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
      .select('id')
      .maybeSingle()
    if (lockError) throw lockError
    if (!locked) throw new HttpError(409, 'This launch is already being processed. Give it a moment.')

    try {
      return await runBatch(admin, user.id, job, ctx.account.meta_account_id, ctx.token, body?.retry_failed === true)
    } finally {
      await admin.from('launch_jobs').update({ locked_until: null }).eq('id', job.id)
    }
  })
)

async function counts(admin: SupabaseClient, jobId: string) {
  const { data, error } = await admin.from('launch_items').select('status').eq('job_id', jobId)
  if (error) throw error
  const tally = { done: 0, failed: 0, pending: 0 }
  for (const r of data ?? []) if (r.status in tally) tally[r.status as keyof typeof tally]++
  return tally
}

async function runBatch(
  admin: SupabaseClient,
  userId: string,
  job: { id: string; workspace_id: string; settings: LaunchSettings; meta_campaign_id: string | null },
  accountId: string,
  token: string,
  retryFailed: boolean,
): Promise<Summary> {
  const settings = job.settings
  const started = Date.now()

  if (retryFailed) {
    await admin.from('launch_items').update({ status: 'pending', error: null, attempts: 0 }).eq('job_id', job.id).eq('status', 'failed')
  }

  // 1. The campaign (once per job)
  let campaignId = job.meta_campaign_id
  if (!campaignId) {
    try {
      const res = await graphPost<{ id: string }>(`/${accountId}/campaigns`, token, campaignParams(settings))
      campaignId = res.id
      await admin.from('launch_jobs').update({ meta_campaign_id: campaignId }).eq('id', job.id)
    } catch (e) {
      if (e instanceof MetaApiError) return await stopJob(admin, job, userId, classifyMetaError(e.info).message)
      throw e
    }
  }

  // 2. A few pending ads
  const { data: pending, error } = await admin
    .from('launch_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('position')
    .limit(BATCH)
  if (error) throw error

  let rateLimited = false
  let fatal: string | null = null
  const imageCache = new Map<string, string>()

  for (const item of (pending ?? []) as Item[]) {
    if (Date.now() - started > DEADLINE_MS) break
    try {
      await processItem(admin, job, settings, accountId, token, campaignId, item, imageCache)
      await admin.from('launch_items').update({ status: 'done', error: null }).eq('id', item.id)
    } catch (e) {
      if (!(e instanceof MetaApiError)) {
        await admin
          .from('launch_items')
          .update({ status: 'failed', error: 'Unexpected error. Please retry.', attempts: item.attempts + 1 })
          .eq('id', item.id)
        console.error('Item failed', item.id, e instanceof Error ? e.message : JSON.stringify(e))
        continue
      }
      const c = classifyMetaError(e.info)
      if (c.kind === 'rate_limit') {
        rateLimited = true // leave the ad pending and let the caller wait
        break
      }
      await admin
        .from('launch_items')
        .update({ status: 'failed', error: c.message, attempts: item.attempts + 1 })
        .eq('id', item.id)
      if (c.kind === 'billing' || c.kind === 'app_mode' || c.kind === 'auth' || c.kind === 'permission') {
        fatal = c.message // every remaining ad would fail the same way
        break
      }
    }
  }

  // 3. Where are we?
  const tally = await counts(admin, job.id)
  if (fatal) return await stopJob(admin, job, userId, fatal)

  let status = 'running'
  if (tally.pending === 0) {
    status = tally.failed === 0 ? 'done' : 'partial'
    await admin.from('launch_jobs').update({ status, finished_at: new Date().toISOString() }).eq('id', job.id)
    await audit(admin, job.workspace_id, userId, 'launch.run', job.id, { ...tally, campaign_id: campaignId })
  }
  return { status, ...tally, rate_limited: rateLimited, fatal: null }
}

/** Marks the job failed with a readable reason. The ads already created stay (paused) and can be retried or undone. */
async function stopJob(
  admin: SupabaseClient,
  job: { id: string; workspace_id: string },
  userId: string,
  message: string,
): Promise<Summary> {
  await admin.from('launch_jobs').update({ status: 'failed', error: message }).eq('id', job.id)
  await audit(admin, job.workspace_id, userId, 'launch.run', job.id, { stopped: message })
  return { status: 'failed', ...(await counts(admin, job.id)), rate_limited: false, fatal: message }
}

async function processItem(
  admin: SupabaseClient,
  job: { id: string },
  settings: LaunchSettings,
  accountId: string,
  token: string,
  campaignId: string,
  item: Item,
  imageCache: Map<string, string>,
) {
  // Ad set (ads with the same ad set name share one)
  let adsetId = item.meta_adset_id
  if (!adsetId) {
    const { data: siblings } = await admin
      .from('launch_items')
      .select('meta_adset_id')
      .eq('job_id', job.id)
      .eq('adset_name', item.adset_name)
      .not('meta_adset_id', 'is', null)
      .limit(1)
    adsetId = siblings?.[0]?.meta_adset_id ?? null
    if (!adsetId) {
      const res = await graphPost<{ id: string }>(`/${accountId}/adsets`, token, adSetParams(settings, campaignId, item.adset_name))
      adsetId = res.id
    }
    await admin.from('launch_items').update({ meta_adset_id: adsetId }).eq('id', item.id)
  }

  // Image
  let hash = item.image_hash ?? imageCache.get(item.image_path) ?? null
  if (!hash) {
    const { data: file, error } = await admin.storage.from('creatives').download(item.image_path)
    if (error || !file) throw new HttpError(404, 'The uploaded image is missing. Upload it again and create a new launch.')
    hash = await graphUploadImage(accountId, token, file, item.image_path.split('/').pop() ?? 'creative.png')
    imageCache.set(item.image_path, hash)
  }
  if (hash !== item.image_hash) await admin.from('launch_items').update({ image_hash: hash }).eq('id', item.id)

  // Creative
  let creativeId = item.meta_creative_id
  if (!creativeId) {
    const res = await graphPost<{ id: string }>(`/${accountId}/adcreatives`, token, creativeParams(settings, item, hash))
    creativeId = res.id
    await admin.from('launch_items').update({ meta_creative_id: creativeId }).eq('id', item.id)
  }

  // Ad
  if (!item.meta_ad_id) {
    const res = await graphPost<{ id: string }>(`/${accountId}/ads`, token, adParams(adsetId, creativeId, item.ad_name))
    await admin.from('launch_items').update({ meta_ad_id: res.id }).eq('id', item.id)
  }
}
