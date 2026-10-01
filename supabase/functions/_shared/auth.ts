import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { HttpError, mustEnv } from './http.ts'

/** Service-role client. Bypasses RLS, so use it only after checking the caller's permissions in code. */
export function adminClient(): SupabaseClient {
  return createClient(mustEnv('SUPABASE_URL'), mustEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Validates the caller's session token with Supabase Auth and returns the user. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please sign in first.')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return data.user
}

/** Throws 403 unless the user is a platform admin (the founder). */
export async function requirePlatformAdmin(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(403, 'Admin access is required.')
}

/** The workspace the user may connect ad accounts to (owner or editor). */
export async function editableWorkspaceId(
  admin: SupabaseClient,
  userId: string,
  workspaceId?: string,
): Promise<string> {
  let query = admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'editor'])
  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  const { data, error } = await query.limit(1)
  if (error) throw error
  const id = data?.[0]?.workspace_id as string | undefined
  if (!id) throw new HttpError(403, 'You need edit access to a workspace to connect an ad account.')
  return id
}
