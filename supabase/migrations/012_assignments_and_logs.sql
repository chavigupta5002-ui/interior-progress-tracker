-- Migration: scope item assignments + an activity log, on top of the
-- scope_items tree from 011_scope_items_hierarchy.sql. Run this in your
-- Supabase project's SQL editor after 011. Safe to re-run.
--
-- NOTE: nothing in the app reads or writes these tables yet — wiring
-- them into the UI (assigning people to a Task/Subtask, showing an
-- activity feed) is a separate, later change. This migration only
-- provisions the tables and their RLS so that later work doesn't need
-- a schema migration of its own.

create table if not exists public.scope_item_assignments (
  id uuid primary key default gen_random_uuid(),
  scope_item_id uuid not null references public.scope_items (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (scope_item_id, profile_id)
);

create index if not exists scope_item_assignments_scope_item_id_idx
  on public.scope_item_assignments (scope_item_id);
create index if not exists scope_item_assignments_profile_id_idx
  on public.scope_item_assignments (profile_id);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  scope_item_id uuid references public.scope_items (id) on delete set null,
  actor_id uuid not null references public.profiles (id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_property_id_created_at_idx
  on public.activity_logs (property_id, created_at desc);
create index if not exists activity_logs_scope_item_id_idx
  on public.activity_logs (scope_item_id);

alter table public.scope_item_assignments enable row level security;
alter table public.activity_logs enable row level security;

-- Same visibility rule as the rest of scope of work: admins/PMs see
-- everything, viewers only see rows under properties they've been
-- granted. activity_logs' property_id is denormalized onto every row
-- specifically so this policy doesn't need to join through scope_items.
drop policy if exists "Scope item assignments readable by admins, PMs, and granted viewers" on public.scope_item_assignments;
create policy "Scope item assignments readable by admins, PMs, and granted viewers"
  on public.scope_item_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.scope_items si
      join public.property_access pa on pa.property_id = si.property_id
      where si.id = scope_item_assignments.scope_item_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and PMs can create scope item assignments" on public.scope_item_assignments;
create policy "Admins and PMs can create scope item assignments"
  on public.scope_item_assignments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can delete scope item assignments" on public.scope_item_assignments;
create policy "Admins and PMs can delete scope item assignments"
  on public.scope_item_assignments for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Activity logs readable by admins, PMs, and granted viewers" on public.activity_logs;
create policy "Activity logs readable by admins, PMs, and granted viewers"
  on public.activity_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = activity_logs.property_id and pa.profile_id = auth.uid()
    )
  );

-- Any authenticated user who can already see the property may log an
-- activity, but only as themselves.
drop policy if exists "Admins, PMs, and granted viewers can log activity" on public.activity_logs;
create policy "Admins, PMs, and granted viewers can log activity"
  on public.activity_logs for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'project_manager')
      )
      or exists (
        select 1 from public.property_access pa
        where pa.property_id = activity_logs.property_id and pa.profile_id = auth.uid()
      )
    )
  );

-- Realtime, guarded so this migration can be re-run safely.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scope_item_assignments'
  ) then
    alter publication supabase_realtime add table public.scope_item_assignments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_logs'
  ) then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
end $$;
