-- Migration: re-assert the admin entry/property/photo policies from
-- 004_admin_entry_and_property_delete.sql. Run this in your Supabase
-- project's SQL editor. Safe to re-run, and safe even if 004 was
-- already applied (every statement is drop-if-exists + create).
--
-- Symptom this fixes: an admin deleting a property gets "Nothing was
-- deleted — you may not have permission to delete this property."
-- Under RLS, a table with NO policy for a given command denies it by
-- default for everyone — so if "Admins can delete properties" (from
-- migration 004) never actually got applied to this database, deletes
-- silently match zero rows for every user, including admins.
--
-- This re-applies that policy plus its three siblings from the same
-- migration, in case those were missed too: admins updating/deleting
-- any entry, and admins deleting any progress photo (needed so an
-- admin deleting a property can also clean up photos they didn't
-- personally upload).
--
-- Deleting a property still cascades to its entries, property_access,
-- and scope of work rows via their existing foreign keys (on delete
-- cascade) — this migration doesn't change that, it only makes sure
-- the admin has permission to trigger the delete in the first place.

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

drop policy if exists "Admins can delete properties" on public.properties;
create policy "Admins can delete properties"
  on public.properties for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Admins can delete any progress photo" on storage.objects;
create policy "Admins can delete any progress photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
