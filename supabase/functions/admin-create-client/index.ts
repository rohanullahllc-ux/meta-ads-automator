// Admin only: creates a client's account with a generated temporary password.
// The password is returned once in the response and is never stored or logged.
import { adminClient, requirePlatformAdmin, requireUser } from '../_shared/auth.ts'
import { audit } from '../_shared/context.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { generateTempPassword, normalizeEmail } from '../_shared/onboarding.ts'

Deno.serve((req) =>
  handle(req, async () => {
    const admin = adminClient()
    const caller = await requireUser(req, admin)
    await requirePlatformAdmin(admin, caller.id)

    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body?.email)
    if (!email) throw new HttpError(422, 'Enter a valid email address.')
    const requestId = typeof body?.request_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.request_id) ? body.request_id : null

    const password = generateTempPassword()
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) {
      if (error && /already|registered|exists/i.test(error.message)) {
        throw new HttpError(409, 'An account with this email already exists.')
      }
      throw error ?? new Error('createUser returned no user')
    }

    if (requestId) {
      await admin
        .from('access_requests')
        .update({ status: 'approved', handled_at: new Date().toISOString(), handled_by: caller.id })
        .eq('id', requestId)
    }

    // The new user's personal workspace is created by a database trigger. Record the action there.
    const { data: membership } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', data.user.id)
      .limit(1)
    if (membership?.[0]) {
      await audit(admin, membership[0].workspace_id, caller.id, 'admin.create_client', data.user.id, { email })
    }

    return { user_id: data.user.id, email, temp_password: password }
  })
)
