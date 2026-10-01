import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { editableWorkspaceId } from './auth.ts'
import { decryptToken } from './crypto.ts'
import { HttpError, mustEnv } from './http.ts'
import type { AccountInfo } from './launch.ts'

export type AccountContext = {
  account: AccountInfo & { id: string; workspace_id: string; meta_account_id: string; name: string | null }
  token: string
}

/**
 * Loads an ad account the user may edit, plus its decrypted Meta token.
 * The token never leaves the Edge Function.
 */
export async function loadAccountContext(admin: SupabaseClient, userId: string, adAccountId: string): Promise<AccountContext> {
  const { data: account, error } = await admin
    .from('ad_accounts')
    .select('id, workspace_id, connection_id, meta_account_id, name, currency, account_status, min_daily_budget')
    .eq('id', adAccountId)
    .maybeSingle()
  if (error) throw error
  if (!account) throw new HttpError(404, 'That ad account was not found.')
  await editableWorkspaceId(admin, userId, account.workspace_id) // throws 403 if the user cannot edit

  const { data: conn, error: connError } = await admin
    .from('meta_connections')
    .select('workspace_id, facebook_user_id, access_token_encrypted, status, token_expires_at')
    .eq('id', account.connection_id)
    .single()
  if (connError) throw connError
  const expired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()
  if (conn.status !== 'active' || expired) {
    throw new HttpError(409, 'The Meta connection has expired. Reconnect the Meta account, then try again.')
  }

  const token = await decryptToken(
    conn.access_token_encrypted,
    mustEnv('TOKEN_ENCRYPTION_KEY'),
    // The token is bound to the workspace that made the connection, which differs from the account's
    // workspace when the founder's connection serves a client (agency model).
    `${conn.workspace_id}:${conn.facebook_user_id}`,
  )
  return { account, token }
}

export async function audit(
  admin: SupabaseClient,
  workspaceId: string,
  actorId: string,
  action: string,
  target: string | null,
  detail: Record<string, unknown>,
) {
  const { error } = await admin
    .from('audit_log')
    .insert({ workspace_id: workspaceId, actor_id: actorId, action, target, detail })
  if (error) console.error('Audit log insert failed', error.message)
}
