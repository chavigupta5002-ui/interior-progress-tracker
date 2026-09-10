-- Interior Progress Tracker — Supabase schema
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- ============================================================
-- 1. Profiles (role + display name, one row per auth user)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'project_manager', 'viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by any authenticated user" on public.profiles;
create policy "Profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

-- Signup can only ever create 'viewer' profiles; project_manager/admin
-- must be granted afterwards by an existing admin.
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile as viewer" on public.profiles;
create policy "Users can insert their own profile as viewer"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'viewer');

-- Users can edit their own display_name etc, but not their own role
-- (prevents self-promotion via a direct table update).
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can update their own profile except role" on public.profiles;
create policy "Users can update their own profile except role"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- NOTE: there's no bootstrap admin yet. After running this schema, sign
-- up normally (you'll get 'viewer'), then promote yourself from the
-- Supabase SQL editor (which bypasses RLS):
--   update public.profiles set role = 'admin' where id = '<your-user-id>';

-- ============================================================
-- 2. Properties / projects (e.g. "Kitchen Reno", "Office Fit-out")
-- ============================================================
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  property_type text not null default 'hotel' check (property_type in ('homestay', 'hotel')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;

-- ============================================================
-- 3. Per-property viewer access.
--    Admins and project managers can always see every property.
--    Viewers can only see properties they've been explicitly granted
--    access to via a row in this table.
-- ============================================================
create table if not exists public.property_access (
  property_id uuid not null references public.properties (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (property_id, profile_id)
);

create index if not exists property_access_profile_id_idx
  on public.property_access (profile_id);

alter table public.property_access enable row level security;

drop policy if exists "Property access is readable by any authenticated user" on public.property_access;
create policy "Property access is readable by any authenticated user"
  on public.property_access for select
  to authenticated
  using (true);

-- Only admins, or the project manager who created the property, can
-- grant/revoke a viewer's access to it.
drop policy if exists "Admins and property owners can grant access" on public.property_access;
create policy "Admins and property owners can grant access"
  on public.property_access for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1 from public.properties pr
      where pr.id = property_access.property_id and pr.created_by = auth.uid()
    )
  );

drop policy if exists "Admins and property owners can revoke access" on public.property_access;
create policy "Admins and property owners can revoke access"
  on public.property_access for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1 from public.properties pr
      where pr.id = property_access.property_id and pr.created_by = auth.uid()
    )
  );

-- ============================================================
-- 4. Properties policies (defined after property_access so the
--    select policy can reference it).
-- ============================================================
drop policy if exists "Properties are readable by any authenticated user" on public.properties;
drop policy if exists "Properties readable by admins, PMs, and granted viewers" on public.properties;
create policy "Properties readable by admins, PMs, and granted viewers"
  on public.properties for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = properties.id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Project managers can create properties" on public.properties;
drop policy if exists "Admins and project managers can create properties" on public.properties;
create policy "Admins and project managers can create properties"
  on public.properties for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

-- Deleting a property cascades to its entries, property_access, and
-- scope of work rows (see their foreign keys); admins still need to
-- clean up storage files separately since those aren't FK-tracked.
drop policy if exists "Admins can delete properties" on public.properties;
create policy "Admins can delete properties"
  on public.properties for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 5. Scope of Work: headers (categories) and their checklist points.
--    Each point is worth an equal share of 100% based on the total
--    number of points in the whole scope (not equal per header) — this
--    weighting is never stored, it's always computed live from the
--    current point count, so adding new points automatically re-spreads
--    the 100% across everything with no migration needed. A header's
--    effective weight is simply the sum of its points' weights.
-- ============================================================
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

-- ============================================================
-- 6. Entries (a photo + note posted to a property's timeline)
-- ============================================================
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  photo_paths text[] not null default '{}',
  note text not null default '',
  show_in_report boolean not null default false,
  created_by uuid not null references public.profiles (id),
  uploader_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists entries_property_id_created_at_idx
  on public.entries (property_id, created_at desc);

alter table public.entries enable row level security;

-- Same visibility rule as properties: admins/PMs see everything,
-- viewers only see entries under properties they've been granted.
drop policy if exists "Entries are readable by any authenticated user" on public.entries;
drop policy if exists "Entries readable by admins, PMs, and granted viewers" on public.entries;
create policy "Entries readable by admins, PMs, and granted viewers"
  on public.entries for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = entries.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Project managers can create entries" on public.entries;
drop policy if exists "Admins and project managers can create entries" on public.entries;
create policy "Admins and project managers can create entries"
  on public.entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    and created_by = auth.uid()
  );

-- Allow the uploader to edit/delete their own entries (optional, handy
-- for typo fixes). Uploaders can otherwise edit their own entry freely,
-- but show_in_report is locked down separately: a BEFORE UPDATE
-- trigger (below) blocks anyone but an admin from changing it after
-- creation, since a bare RLS WITH CHECK that re-queries entries to
-- compare against the stored value is fragile — it depends on exactly
-- when Postgres considers that re-query's snapshot to include the
-- in-flight update, which both risks "infinite recursion detected in
-- policy for relation 'entries'" (entries' own SELECT policy is
-- correlated, unlike e.g. profiles' trivial using(true)) and can wrongly
-- reject edits that never touch show_in_report at all. A trigger gets
-- NEW/OLD as direct values with no such ambiguity.
drop policy if exists "Uploaders can update their own entries" on public.entries;
create policy "Uploaders can update their own entries"
  on public.entries for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Uploaders can delete their own entries" on public.entries;
create policy "Uploaders can delete their own entries"
  on public.entries for delete
  to authenticated
  using (created_by = auth.uid());

-- Enforces the show_in_report lock described above: only admins may
-- change it once an entry exists.
drop trigger if exists entries_show_in_report_lock on public.entries;

create or replace function public.enforce_entries_show_in_report_lock()
returns trigger
language plpgsql
as $$
begin
  if NEW.show_in_report is distinct from OLD.show_in_report then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    ) then
      raise exception 'Only admins can change show_in_report after an entry is created';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger entries_show_in_report_lock
  before update on public.entries
  for each row
  execute function public.enforce_entries_show_in_report_lock();

-- Admins can update/delete any entry, regardless of uploader, with no
-- column restrictions (so they can flip show_in_report at any time).
drop policy if exists "Admins can update any entry" on public.entries;
create policy "Admins can update any entry"
  on public.entries for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Admins can delete any entry" on public.entries;
create policy "Admins can delete any entry"
  on public.entries for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 7. Realtime: live updates for entries and the scope of work
--    checklist. Guarded so this script can be safely re-run.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
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

-- ============================================================
-- 8. Storage bucket for photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- Anyone authenticated can view photos (bucket is also public for simple <img> access).
drop policy if exists "Authenticated users can read progress photos" on storage.objects;
create policy "Authenticated users can read progress photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'progress-photos');

drop policy if exists "Public can read progress photos" on storage.objects;
create policy "Public can read progress photos"
  on storage.objects for select
  to public
  using (bucket_id = 'progress-photos');

-- Only admins and project managers can upload photos.
drop policy if exists "Project managers can upload progress photos" on storage.objects;
drop policy if exists "Admins and project managers can upload progress photos" on storage.objects;
create policy "Admins and project managers can upload progress photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Uploaders can delete their own progress photos" on storage.objects;
create policy "Uploaders can delete their own progress photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'progress-photos' and owner = auth.uid());

-- Admins can delete any progress photo, not just ones they uploaded
-- (needed when deleting someone else's entry or an entire property).
drop policy if exists "Admins can delete any progress photo" on storage.objects;
create policy "Admins can delete any progress photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
