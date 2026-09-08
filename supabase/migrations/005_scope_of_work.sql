-- Migration: Scope of Work checklist per property.
-- Run this in your Supabase project's SQL editor after
-- 004_admin_entry_and_property_delete.sql. Safe to re-run.
--
-- Each point is worth an equal share of 100% based on the total number
-- of points in the whole scope (not equal per header) — that weighting
-- is never stored, it's always computed live from the current point
-- count, so adding new points automatically re-spreads the 100% across
-- everything without a migration.

create table if not exists public.scope_headers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists scope_headers_property_id_idx on public.scope_headers (property_id);

create table if not exists public.scope_points (
  id uuid primary key default gen_random_uuid(),
  header_id uuid not null references public.scope_headers (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists scope_points_property_id_idx on public.scope_points (property_id);
create index if not exists scope_points_header_id_idx on public.scope_points (header_id);

alter table public.scope_headers enable row level security;
alter table public.scope_points enable row level security;

-- Visibility matches properties/entries: admins/PMs see everything,
-- viewers only see the scope for properties they've been granted.
drop policy if exists "Scope headers readable by admins, PMs, and granted viewers" on public.scope_headers;
create policy "Scope headers readable by admins, PMs, and granted viewers"
  on public.scope_headers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_headers.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Scope points readable by admins, PMs, and granted viewers" on public.scope_points;
create policy "Scope points readable by admins, PMs, and granted viewers"
  on public.scope_points for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_points.property_id and pa.profile_id = auth.uid()
    )
  );

-- Admins and project managers can define and manage the scope of work:
-- add/remove headers and points, and check/uncheck any point (checking
-- is a shared team action, not restricted to whoever added the point).
drop policy if exists "Admins and PMs can create scope headers" on public.scope_headers;
create policy "Admins and PMs can create scope headers"
  on public.scope_headers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can update scope headers" on public.scope_headers;
create policy "Admins and PMs can update scope headers"
  on public.scope_headers for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can delete scope headers" on public.scope_headers;
create policy "Admins and PMs can delete scope headers"
  on public.scope_headers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can create scope points" on public.scope_points;
create policy "Admins and PMs can create scope points"
  on public.scope_points for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can update scope points" on public.scope_points;
create policy "Admins and PMs can update scope points"
  on public.scope_points for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can delete scope points" on public.scope_points;
create policy "Admins and PMs can delete scope points"
  on public.scope_points for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

-- Realtime, guarded so this migration can be re-run safely.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scope_headers'
  ) then
    alter publication supabase_realtime add table public.scope_headers;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scope_points'
  ) then
    alter publication supabase_realtime add table public.scope_points;
  end if;
end $$;
