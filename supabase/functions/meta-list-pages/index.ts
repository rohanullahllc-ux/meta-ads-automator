// Lists the Facebook Pages an ad account can advertise from, so the user can pick one.
import { adminClient, requireUser } from '../_shared/auth.ts'
import { loadAccountContext } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { graphGet, MetaApiError } from '../_shared/meta.ts'

type Page = { id: string; name: string }

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = await req.json().catch(() => ({}))
    if (typeof body?.ad_account_id !== 'string') throw new HttpError(400, 'Choose an ad account.')
    const { account, token } = await loadAccountContext(admin, user.id, body.ad_account_id)

    // Pages promotable from this account first; fall back to the Pages the user manages.
    let pages: Page[] = []
    try {
      const res = await graphGet<{ data: Page[] }>(`/${account.meta_account_id}/promote_pages`, token, { fields: 'id,name', limit: '100' })
      pages = res.data ?? []
    } catch (e) {
      if (!(e instanceof MetaApiError)) throw e
    }
    if (pages.length === 0) {
      const res = await graphGet<{ data: Page[] }>('/me/accounts', token, { fields: 'id,name', limit: '100' })
      pages = res.data ?? []
    }
    return { pages: pages.map((p) => ({ id: p.id, name: p.name })) }
  })
)
