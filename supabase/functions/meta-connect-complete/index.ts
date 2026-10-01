// Step 2 of connecting Meta: exchanges the login code for a long-lived token, encrypts it,
// stores it with the user's ad accounts, and records the action in the audit log.
//
// Login-CSRF protection: the signed state must belong to the *same signed-in user* who calls this function,
// so an attacker cannot make a victim's browser attach the victim's ad accounts to the attacker's workspace.
import { adminClient, editableWorkspaceId, requireUser } from '../_shared/auth.ts'
import { encryptToken, verifyState } from '../_shared/crypto.ts'
import { allowedOrigins, handle, HttpError, mustEnv } from '../_shared/http.ts'
import { fetchAdAccounts, graphGet, graphGetOAuth } from '../_shared/meta.ts'

type StatePayload = { uid: string; ws: string; origin: string; exp: number; n: string }

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const user = await requireUser(req, admin)

    const body = await req.json().catch(() => ({}))
    const { code, state } = body ?? {}
    if (typeof code !== 'string' || typeof state !== 'string') {
      throw new HttpError(400, 'The Meta login did not return a code. Please try again.')
    }

    const payload = await verifyState<StatePayload>(state, mustEnv('STATE_SIGNING_KEY'))
    if (!payload) throw new HttpError(400, 'This connection attempt expired or is invalid. Please start again.')
    if (payload.uid !== user.id) throw new HttpError(403, 'This connection attempt belongs to a different user.')
    if (!allowedOrigins().includes(payload.origin)) throw new HttpError(400, 'This app address is not allowed.')
    // Permission is re-checked now, in case access changed since the attempt started.
    const workspaceId = await editableWorkspaceId(admin, user.id, payload.ws)

    const appId = mustEnv('META_APP_ID')
    const appSecret = mustEnv('META_APP_SECRET')

    // code -> short-lived token -> long-lived token (about 60 days)
    const short = await graphGetOAuth<{ access_token: string }>('/oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: `${payload.origin}/meta/callback`,
      code,
    })
    const long = await graphGetOAuth<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    })
    const token = long.access_token
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null

    const me = await graphGet<{ id: string; name?: string }>('/me', token, { fields: 'id,name' })
    const perms = await graphGet<{ data: { permission: string; status: string }[] }>('/me/permissions', token)
    const scopes = perms.data.filter((p) => p.status === 'granted').map((p) => p.permission)
    if (!scopes.includes('ads_management')) {
      throw new HttpError(400, 'The ads_management permission was not granted. Please reconnect and allow it.')
    }

    const accounts = await fetchAdAccounts(token)

    const encrypted = await encryptToken(token, mustEnv('TOKEN_ENCRYPTION_KEY'), `${workspaceId}:${me.id}`)
    const { data: connection, error: connError } = await admin
      .from('meta_connections')
      .upsert(
        {
          workspace_id: workspaceId,
          connected_by: user.id,
          facebook_user_id: me.id,
          facebook_user_name: me.name ?? null,
          access_token_encrypted: encrypted,
          token_expires_at: expiresAt,
          scopes,
          status: 'active',
        },
        { onConflict: 'workspace_id,facebook_user_id' },
      )
      .select('id')
      .single()
    if (connError) throw connError

    if (accounts.length > 0) {
      const { error: accError } = await admin.from('ad_accounts').upsert(
        accounts.map((a) => ({
          workspace_id: workspaceId,
          connection_id: connection.id,
          meta_account_id: a.id,
          name: a.name ?? null,
          currency: a.currency ?? null,
          timezone_name: a.timezone_name ?? null,
          account_status: a.account_status ?? null,
          min_daily_budget: a.min_daily_budget != null ? Number(a.min_daily_budget) : null,
          has_payment_method: null, // unknown here; set to false when a launch dry run hits Meta error 1359188
          refreshed_at: new Date().toISOString(),
        })),
        { onConflict: 'workspace_id,meta_account_id' },
      )
      if (accError) throw accError
    }

    const { error: auditError } = await admin.from('audit_log').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: 'meta.connect',
      target: me.id,
      detail: { ad_accounts: accounts.length, scopes }, // never include tokens
    })
    if (auditError) console.error('Audit log insert failed', auditError.message)

    return { connection_id: connection.id, ad_accounts: accounts.length }
  })
)
