-- Migration: per-property viewer access + admin-only role promotion.
-- Run this in your Supabase project's SQL editor if you already ran
-- supabase/schema.sql (which previously let any authenticated user see
-- every property and let users pick their own role at signup).
-- Safe to re-run.

-- ============================================================
-- 1. Add an 'admin' role. Admins can promote/demote users and manage
--    access to any property. project_managers keep their existing
--    powers (create properties, post entries) but cannot change roles.
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'project_manager', 'viewer'));

-- ============================================================
-- 2. Lock down role changes.
--    - A user can still update their own display_name, but can no
--      longer change their own role (closes the self-promotion hole:
--      previously "Users can update their own profile" had no `with
--      check`, so any signed-in user could set role = 'project_manager'
--      or 'admin' on themselves via a direct table update).
--    - Signup can now only ever create 'viewer' profiles.
--    - Only admins can change anyone's role (including their own).
-- ============================================================
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile as viewer"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'viewer');

drop policy if exists "Users can update their own profile" on public.profiles;
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

-- NOTE: this policy set has no bootstrap admin yet. After running this
-- migration, promote your first admin manually from the Supabase table
-- editor (or SQL editor, which bypasses RLS):
--   update public.profiles set role = 'admin' where id = '<your-user-id>';

-- ============================================================
-- 3. Per-property viewer access.
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
-- 4. Scope properties/entries visibility: admins and project_managers
--    still see everything; viewers only see properties (and their
--    entries) they've been explicitly granted access to.
-- ============================================================
drop policy if exists "Properties are readable by any authenticated user" on public.properties;
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
create policy "Admins and project managers can create properties"
  on public.properties for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Entries are readable by any authenticated user" on public.entries;
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

-- ============================================================
-- 5. Storage: allow admins to upload too (project managers already could).
-- ============================================================
drop policy if exists "Project managers can upload progress photos" on storage.objects;
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
