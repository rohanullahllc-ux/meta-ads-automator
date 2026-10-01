-- Core schema: workspaces, membership, Meta connections, ad accounts, billing, audit log.
-- Every table has row level security. Tenant = workspace.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create type public.workspace_role as enum ('owner', 'editor', 'viewer');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Membership helpers. security definer so policies on workspace_members can use them without recursion.
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(ws uuid, allowed public.workspace_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any(allowed)
  );
$$;

-- A personal workspace is created for every new user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name, created_by)
  values (coalesce(split_part(new.email, '@', 1), 'My workspace'), new.id)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['owner']::public.workspace_role[]))
  with check (public.has_workspace_role(id, array['owner']::public.workspace_role[]));

create policy members_select on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- ------------------------------------------------------------ Meta connections
-- Tokens are encrypted by the Edge Function before they reach this table.
-- The browser (authenticated role) can never read the token column.
create table public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connected_by uuid not null references auth.users(id) on delete restrict,
  facebook_user_id text not null,
  facebook_user_name text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  unique (workspace_id, facebook_user_id)
);

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  meta_account_id text not null,           -- act_123...
  name text,
  currency text,
  timezone_name text,
  account_status integer,
  min_daily_budget bigint,                 -- smallest currency unit, read from Meta per account
  has_payment_method boolean,
  refreshed_at timestamptz not null default now(),
  unique (workspace_id, meta_account_id)
);
create index ad_accounts_connection_idx on public.ad_accounts (connection_id);

alter table public.meta_connections enable row level security;
alter table public.ad_accounts enable row level security;

revoke all on public.meta_connections from anon, authenticated;
grant select (id, workspace_id, connected_by, facebook_user_id, facebook_user_name,
              token_expires_at, scopes, status, created_at)
  on public.meta_connections to authenticated;

create policy meta_connections_select on public.meta_connections
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy ad_accounts_select on public.ad_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Writes to both tables happen only in Edge Functions using the service role.

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,                    -- e.g. 'meta.connect', 'meta.campaign.create'
  target text,                             -- Meta object id or internal id
  detail jsonb not null default '{}'::jsonb,   -- never put tokens here
  created_at timestamptz not null default now()
);
create index audit_log_workspace_idx on public.audit_log (workspace_id, created_at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Inserts only from Edge Functions (service role). No update or delete policy exists.

-- ------------------------------------------------------------------ billing
-- Manual Payoneer billing for now (see BUILD_PLAN.md section 3b).
create table public.plans (
  id text primary key,                     -- 'free', 'pro', 'agency'
  name text not null,
  monthly_price_usd numeric(10, 2) not null default 0,
  max_ad_accounts integer not null,
  max_ads_per_month integer                -- null = unlimited
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  locked_price_usd numeric(10, 2),         -- founding-client price
  current_period_end timestamptz,
  billing_provider text not null default 'manual_payoneer'
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_number text not null unique,     -- e.g. MAA-2026-0007
  amount_usd numeric(10, 2) not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  due_date date,
  payment_link text,
  payoneer_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_workspace_idx on public.invoices (workspace_id, created_at desc);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;

create policy plans_select on public.plans for select to authenticated using (true);
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy invoices_select on public.invoices
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Billing writes are admin/service-role only.

-- ------------------------------------------------------------------- grants
-- The project is created with "Automatically expose new tables" OFF, so access is explicit.
-- Row level security (policies above) still decides which rows each user can see.
grant usage on schema public to anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.ad_accounts,
                public.audit_log, public.plans, public.subscriptions, public.invoices
  to authenticated;
grant update (name) on public.workspaces to authenticated;
-- meta_connections: column-level select grant is defined above (token column excluded).
-- anon gets nothing. The service role (Edge Functions) bypasses RLS and does all other writes.

insert into public.plans (id, name, monthly_price_usd, max_ad_accounts, max_ads_per_month) values
  ('free',   'Free',   0,  1,  10),
  ('pro',    'Pro',    39, 3,  300),
  ('agency', 'Agency', 99, 15, null);
