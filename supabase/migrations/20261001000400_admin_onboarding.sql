-- Invite-only onboarding: who the platform admins are, and requests for access from prospects.
-- The browser may read these rows only if the user is a platform admin. Writes happen in Edge Functions.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  facebook_profile text,
  message text,
  status text not null default 'new' check (status in ('new', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);
create index access_requests_status_idx on public.access_requests (status, created_at desc);
create index access_requests_email_idx on public.access_requests (email, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.access_requests enable row level security;

-- A user can see only their own admin row, which is how the app knows to show the Admin link.
create policy platform_admins_self on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

create policy access_requests_admin_select on public.access_requests
  for select to authenticated
  using (exists (select 1 from public.platform_admins a where a.user_id = auth.uid()));

grant select on public.platform_admins, public.access_requests to authenticated;
grant all on public.platform_admins, public.access_requests to service_role;
