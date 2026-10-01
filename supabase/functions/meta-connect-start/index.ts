// Step 1 of connecting Meta: returns the Facebook login URL for the signed-in user.
// The `state` is signed and bound to the user, workspace and app origin, and expires in 10 minutes.
import { adminClient, editableWorkspaceId, requireUser } from '../_shared/auth.ts'
import { signState } from '../_shared/crypto.ts'
import { allowedOrigins, handle, HttpError, mustEnv } from '../_shared/http.ts'
import { graphVersion } from '../_shared/meta.ts'

const STATE_TTL_MS = 10 * 60 * 1000
const DEFAULT_SCOPES = 'ads_management,ads_read,business_management,pages_show_list'

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const user = await requireUser(req, admin)

    const body = await req.json().catch(() => ({}))
    const origin = body?.origin
    if (typeof origin !== 'string' || !allowedOrigins().includes(origin)) {
      throw new HttpError(400, 'This app address is not allowed to connect Meta accounts.')
    }

    const workspaceId = await editableWorkspaceId(admin, user.id)
    const state = await signState(
      { uid: user.id, ws: workspaceId, origin, exp: Date.now() + STATE_TTL_MS, n: crypto.randomUUID() },
      mustEnv('STATE_SIGNING_KEY'),
    )

    const params = new URLSearchParams({
      client_id: mustEnv('META_APP_ID'),
      redirect_uri: `${origin}/meta/callback`,
      response_type: 'code',
      state,
    })
    // "Facebook Login for Business" apps use a configuration id instead of a scope list.
    const configId = Deno.env.get('META_LOGIN_CONFIG_ID')
    if (configId) params.set('config_id', configId)
    else params.set('scope', Deno.env.get('META_SCOPES') ?? DEFAULT_SCOPES)

    return { url: `https://www.facebook.com/${graphVersion()}/dialog/oauth?${params}`, state }
  })
)
