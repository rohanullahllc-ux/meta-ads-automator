-- Bulk launcher: jobs, items, and a private bucket for creative images.
-- The browser can read these rows (RLS) but never writes them. Edge Functions do all writes.

create table public.launch_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null,
  settings jsonb not null,                       -- normalised snapshot (see _shared/launch.ts LaunchSettings)
  warnings text[] not null default '{}',
  status text not null default 'ready'
    check (status in ('ready', 'running', 'partial', 'failed', 'done', 'undone')),
  meta_campaign_id text,
  error text,
  locked_until timestamptz,                      -- prevents two runs of the same job at once
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index launch_jobs_workspace_idx on public.launch_jobs (workspace_id, created_at desc);

create table public.launch_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.launch_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position integer not null,
  adset_name text not null,
  ad_name text not null,
  headline text,
  primary_text text,
  link_url text not null,
  cta text not null,
  image_path text not null,                      -- path in the 'creatives' bucket
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'undone')),
  -- Meta ids are saved the moment each object exists, so a retry resumes instead of duplicating.
  image_hash text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  error text,
  attempts integer not null default 0,
  unique (job_id, position)
);
create index launch_items_job_idx on public.launch_items (job_id, position);

alter table public.launch_jobs enable row level security;
alter table public.launch_items enable row level security;

create policy launch_jobs_select on public.launch_jobs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy launch_items_select on public.launch_items
  for select to authenticated using (public.is_workspace_member(workspace_id));

grant select on public.launch_jobs, public.launch_items to authenticated;
grant all on public.launch_jobs, public.launch_items to service_role;

-- ------------------------------------------------------------------ creative image storage
-- Files live under <workspace_id>/<file>. Editors can upload and remove their workspace's files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creatives', 'creatives', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy creatives_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'creatives' and exists (
      select 1 from public.workspace_members m
      where m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
        and m.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy creatives_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'creatives' and exists (
      select 1 from public.workspace_members m
      where m.user_id = auth.uid()
        and m.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy creatives_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'creatives' and exists (
      select 1 from public.workspace_members m
      where m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
        and m.workspace_id::text = (storage.foldername(name))[1]
    )
  );
