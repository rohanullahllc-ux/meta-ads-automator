// Admin only (agency model): links an ad account to a client's workspace.
// The client shares the ad account and Page with the founder's Business Portfolio in Meta Business Suite.
// The founder's own Meta connection is then used to act on it, so clients never log in to Facebook.
import { adminClient, editableWorkspaceId, requirePlatformAdmin, requireUser } from '../_shared/auth.ts'
import { audit } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { graphGet, type MetaAdAccount } from '../_shared/meta.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { mustEnv } from '../_shared/http.ts'
import { normalizeEmail } from '../_shared/onboarding.ts'

function normalizeAccountId(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  const m = /^(?:act_)?(\d{5,20})$/.exec(s)
  return m ? `act_${m[1]}` : null
}

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const caller = await requireUser(req, admin)
    await requirePlatformAdmin(admin, caller.id)

    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body?.client_email)
    const accountId = normalizeAccountId(body?.meta_account_id)
    if (!email) throw new HttpError(422, 'Enter the client\'s sign-in email.')
    if (!accountId) throw new HttpError(422, 'Enter the ad account ID (numbers, with or without act_).')

    // The founder's own Meta connection (Facebook Login by a person with a role on the Meta app).
    const { data: conn, error: connError } = await admin
      .from('meta_connections')
      .select('id, workspace_id, facebook_user_id, access_token_encrypted, status, token_expires_at')
      .eq('connected_by', caller.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (connError) throw connError
    if (!conn) throw new HttpError(409, 'Connect your own Meta account on the dashboard first.')
    if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
      throw new HttpError(409, 'Your Meta connection has expired. Reconnect it on the dashboard first.')
    }
    const token = await decryptToken(
      conn.access_token_encrypted,
      mustEnv('TOKEN_ENCRYPTION_KEY'),
      `${conn.workspace_id}:${conn.facebook_user_id}`,
    )

    // Find the client (small user base during the pilot, so a paged scan is fine).
    let clientId: string | null = null
    for (let page = 1; page <= 20 && !clientId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      clientId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
      if (data.users.length < 1000) break
    }
    if (!clientId) throw new HttpError(404, 'No client account has that email. Create the account first.')
    const workspaceId = await editableWorkspaceId(admin, clientId)

    // Prove Meta lets us act on the account before linking it.
    let info: MetaAdAccount
    try {
      info = await graphGet<MetaAdAccount>(`/${accountId}`, token, {
        fields: 'id,name,currency,timezone_name,account_status,min_daily_budget',
      })
    } catch {
      throw new HttpError(
        422,
        'Meta did not let your login open that ad account. Check that the client shared it with your Business Portfolio and gave your user access.',
      )
    }

    const { error: upsertError } = await admin.from('ad_accounts').upsert(
      {
        workspace_id: workspaceId,
        connection_id: conn.id,
        meta_account_id: accountId,
        name: info.name ?? null,
        currency: info.currency ?? null,
        timezone_name: info.timezone_name ?? null,
        account_status: info.account_status ?? null,
        min_daily_budget: info.min_daily_budget != null ? Number(info.min_daily_budget) : null,
        has_payment_method: null,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,meta_account_id' },
    )
    if (upsertError) throw upsertError

    await audit(admin, workspaceId, caller.id, 'admin.link_account', accountId, { client_email: email })
    return { meta_account_id: accountId, name: info.name ?? null, currency: info.currency ?? null }
  })
)
