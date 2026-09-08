-- Migration: admin-level entry/property management.
-- Run this in your Supabase project's SQL editor after
-- 003_property_access_and_admin.sql. Safe to re-run.
--
-- Adds:
--  - Admins can update/delete ANY entry (project managers keep their
--    existing "own entries only" update/delete rights, unchanged).
--  - Admins can delete a property (its entries and property_access
--    rows cascade automatically via existing foreign keys).
--  - Admins can delete any progress photo in storage (needed so
--    deleting someone else's entry, or a whole property, can also
--    clean up files the admin didn't personally upload).

-- ============================================================
-- 1. Admins can update/delete any entry.
-- ============================================================
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
-- 2. Admins can delete a property.
-- ============================================================
drop policy if exists "Admins can delete properties" on public.properties;
create policy "Admins can delete properties"
  on public.properties for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 3. Admins can delete any progress photo in storage.
-- ============================================================
drop policy if exists "Admins can delete any progress photo" on storage.objects;
create policy "Admins can delete any progress photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
