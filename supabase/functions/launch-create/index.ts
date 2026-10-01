// Validates a launch request (locally, then with a live Meta dry run) and stores it as a "ready" job.
// Nothing is created in Meta here. The user reviews the job first, then runs it.
import { adminClient, requireUser } from '../_shared/auth.ts'
import { audit, loadAccountContext } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { campaignParams, classifyMetaError, validateLaunch } from '../_shared/launch.ts'
import { graphPost, MetaApiError } from '../_shared/meta.ts'

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const user = await requireUser(req, admin)

    const body = await req.json().catch(() => ({}))
    const adAccountId = body?.ad_account_id
    if (typeof adAccountId !== 'string') throw new HttpError(400, 'Choose an ad account.')
    const { account, token } = await loadAccountContext(admin, user.id, adAccountId)

    const result = validateLaunch(body?.input, account, account.workspace_id)
    if (!result.ok) throw new HttpError(422, result.errors.join('\n'))

    // Every referenced image must exist in this workspace's storage folder.
    const paths = [...new Set(result.items.map((i) => i.image_path))]
    const { data: signed, error: signError } = await admin.storage.from('creatives').createSignedUrls(paths, 60)
    if (signError) throw signError
    if ((signed ?? []).some((s) => s.error)) {
      throw new HttpError(422, 'Some uploaded images could not be found. Please upload them again.')
    }

    // Live check with Meta: validate_only creates nothing. It catches expired logins, disabled accounts and
    // permission problems before the user sees a "ready" review screen.
    try {
      await graphPost(`/${account.meta_account_id}/campaigns`, token, {
        ...campaignParams(result.settings),
        execution_options: ['validate_only'],
      })
    } catch (e) {
      if (e instanceof MetaApiError) throw new HttpError(422, `Meta check failed: ${classifyMetaError(e.info).message}`)
      throw e
    }

    const { data: job, error: jobError } = await admin
      .from('launch_jobs')
      .insert({
        workspace_id: account.workspace_id,
        ad_account_id: account.id,
        created_by: user.id,
        name: result.settings.campaign_name,
        settings: result.settings,
        warnings: result.warnings,
      })
      .select('id')
      .single()
    if (jobError) throw jobError

    const { error: itemsError } = await admin
      .from('launch_items')
      .insert(result.items.map((i) => ({ ...i, job_id: job.id, workspace_id: account.workspace_id })))
    if (itemsError) {
      await admin.from('launch_jobs').delete().eq('id', job.id)
      throw itemsError
    }

    await audit(admin, account.workspace_id, user.id, 'launch.create', job.id, {
      ads: result.items.length,
      ad_sets: result.settings.display.ad_sets,
    })
    return { job_id: job.id, warnings: result.warnings }
  })
)
