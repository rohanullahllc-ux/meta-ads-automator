-- Tighten table privileges.
-- Found after the first run: the anonymous role could still SELECT from most tables
-- (RLS returned zero rows, so no data leaked, but anon should have no access at all).
-- Rule going forward: anon gets nothing. authenticated gets only what the app needs,
-- and Row Level Security still filters which rows are visible.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

revoke execute on function public.is_workspace_member(uuid) from public, anon, authenticated;
revoke execute on function public.has_workspace_role(uuid, public.workspace_role[]) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Re-grant exactly what signed-in users need.
grant usage on schema public to anon, authenticated;

grant select on public.workspaces, public.workspace_members, public.ad_accounts,
                public.audit_log, public.plans, public.subscriptions, public.invoices
  to authenticated;
grant update (name) on public.workspaces to authenticated;

-- meta_connections: never expose the encrypted token column to the browser.
grant select (id, workspace_id, connected_by, facebook_user_id, facebook_user_name,
              token_expires_at, scopes, status, created_at)
  on public.meta_connections to authenticated;

-- RLS policies call these helpers as the signed-in user, so that role must be able to run them.
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;

-- Future tables and functions created by this role are private by default.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
