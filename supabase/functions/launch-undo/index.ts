// Removes everything a launch created in Meta. Deleting the campaign removes its ad sets and ads;
// creatives are separate objects and are deleted individually. Uploaded images stay in the ad account's
// library on purpose: Meta de-duplicates images, so one may also be used by the customer's other ads.
import { adminClient, requireUser } from '../_shared/auth.ts'
import { audit, loadAccountContext } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { classifyMetaError } from '../_shared/launch.ts'
import { graphDelete, graphPost, MetaApiError } from '../_shared/meta.ts'

const LOCK_MS = 150_000

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
    const { token } = await loadAccountContext(admin, user.id, job.ad_account_id)
    if (!['ready', 'partial', 'failed', 'done'].includes(job.status)) {
      throw new HttpError(409, `This launch is ${job.status} and cannot be undone right now.`)
    }

    const now = new Date()
    const { data: locked, error: lockError } = await admin
      .from('launch_jobs')
      .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
      .eq('id', job.id)
      .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
      .select('id')
      .maybeSingle()
    if (lockError) throw lockError
    if (!locked) throw new HttpError(409, 'This launch is being processed. Try again in a moment.')

    const problems: string[] = []
    try {
      const { data: items, error: itemsError } = await admin
        .from('launch_items')
        .select('meta_creative_id')
        .eq('job_id', job.id)
        .not('meta_creative_id', 'is', null)
      if (itemsError) throw itemsError

      // Campaign first: this also removes its ad sets and ads.
      if (job.meta_campaign_id) {
        try {
          await graphPost(`/${job.meta_campaign_id}`, token, { status: 'DELETED' })
        } catch (e) {
          if (!(e instanceof MetaApiError)) throw e
          const c = classifyMetaError(e.info)
          if (c.kind !== 'not_found') problems.push(`Campaign: ${c.message}`)
        }
      }

      for (const creativeId of new Set((items ?? []).map((i) => i.meta_creative_id as string))) {
        try {
          await graphDelete(`/${creativeId}`, token)
        } catch (e) {
          if (!(e instanceof MetaApiError)) throw e
          const c = classifyMetaError(e.info)
          if (c.kind !== 'not_found') problems.push(`Creative ${creativeId}: ${c.message}`)
        }
      }

      if (problems.length === 0) {
        await admin
          .from('launch_jobs')
          .update({ status: 'undone', error: null, finished_at: new Date().toISOString() })
          .eq('id', job.id)
        await admin.from('launch_items').update({ status: 'undone' }).eq('job_id', job.id)
      } else {
        await admin.from('launch_jobs').update({ error: `Undo was incomplete: ${problems.join(' | ')}` }).eq('id', job.id)
      }
      await audit(admin, job.workspace_id, user.id, 'launch.undo', job.id, { problems })
    } finally {
      await admin.from('launch_jobs').update({ locked_until: null }).eq('id', job.id)
    }

    return { status: problems.length === 0 ? 'undone' : job.status, problems }
  })
)
