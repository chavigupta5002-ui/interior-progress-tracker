-- Migration: a hidden 'dev' role — a superset of admin's access, plus a
-- few dev-exclusive capabilities, invisible to everyone else. Run this
-- in your Supabase project's SQL editor after 014. Safe to re-run.
--
-- Design:
--  - dev satisfies every RLS check that currently allows
--    role in ('admin', 'project_manager') or role = 'admin', so dev has
--    at least everything admin has (property_access bypass included).
--    This is purely additive: nothing admin can do today changes.
--  - dev gets two exclusive capabilities nothing else has:
--      1. delete individual activity_logs rows (no DELETE policy existed
--         on that table before this migration — nobody could do this).
--      2. delete a profiles row outright (distinct from admin's existing
--         demote/revoke-access, which only change a user's role or
--         property_access — this removes the row entirely). In
--         practice this only succeeds for a profile with no history:
--         properties.created_by, entries.created_by, scope_items.
--         created_by/checked_by, activity_logs.actor_id/
--         target_profile_id, scope_item_assignments.profile_id/
--         assigned_by, and property_access.profile_id/granted_by all
--         reference profiles(id) with no ON DELETE rule (default
--         RESTRICT) and several are NOT NULL, so deleting a profile
--         with any activity will raise a foreign-key violation. That's
--         a deliberate limit of the current schema, not swallowed here.
--  - dev's own actions still write to activity_logs normally (actor_id
--    = auth.uid() same as everyone), preserving a forensic trail. They
--    are simply excluded from what admins/PMs/viewers can query: the
--    dev's own profiles row is hidden from everyone but themselves, and
--    any activity_logs row whose actor is the dev account is hidden the
--    same way. Both stay fully visible to the dev account itself, and
--    the underlying rows are never deleted by this filtering — only
--    RLS-invisible to non-dev viewers.
--  - Nothing in this migration grants a client-side path to actually
--    delete a Supabase Auth account (auth.users) — that requires the
--    service_role key via the Admin API, which this app doesn't have.
--    "Delete a profile" here only ever removes the public.profiles row;
--    the person's auth login still exists, they just can't use the app
--    (no profile to load).

-- ============================================================
-- 1. Allow 'dev' as a role, and promote the owner's account.
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'project_manager', 'viewer', 'dev'));

update public.profiles
set role = 'dev'
where id = (select id from auth.users where email = 'chavigupta5002@gmail.com');

-- ============================================================
-- 2. profiles: hide the dev row from everyone but itself; let dev (like
--    admin) update any profile; new dev-only hard delete.
-- ============================================================
drop policy if exists "Profiles are readable by any authenticated user" on public.profiles;
drop policy if exists "Profiles readable by any authenticated user except hidden dev accounts" on public.profiles;
create policy "Profiles readable by any authenticated user except hidden dev accounts"
  on public.profiles for select
  to authenticated
  using (
    role <> 'dev'
    or id = auth.uid()
  );

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  );

-- New: nothing could delete a profiles row before this. dev-only — see
-- the note at the top of this file about the FK constraints this will
-- run into for any profile with activity.
drop policy if exists "Dev can delete a profile" on public.profiles;
create policy "Dev can delete a profile"
  on public.profiles for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dev')
  );

-- ============================================================
-- 3. property_access: admin-only grant/revoke checks become admin/dev.
-- ============================================================
drop policy if exists "Admins and property owners can grant access" on public.property_access;
create policy "Admins and property owners can grant access"
  on public.property_access for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
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
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
    or exists (
      select 1 from public.properties pr
      where pr.id = property_access.property_id and pr.created_by = auth.uid()
    )
  );

-- ============================================================
-- 4. properties: add dev to the admin/PM read+create list, and to the
--    admin-only delete check.
-- ============================================================
drop policy if exists "Properties readable by admins, PMs, and granted viewers" on public.properties;
create policy "Properties readable by admins, PMs, and granted viewers"
  on public.properties for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = properties.id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and project managers can create properties" on public.properties;
create policy "Admins and project managers can create properties"
  on public.properties for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins can delete properties" on public.properties;
create policy "Admins can delete properties"
  on public.properties for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  );

-- ============================================================
-- 5. scope_headers / scope_points (legacy, unused by the app, but kept
--    in sync for completeness — see 011_scope_items_hierarchy.sql).
-- ============================================================
drop policy if exists "Scope headers readable by admins, PMs, and granted viewers" on public.scope_headers;
create policy "Scope headers readable by admins, PMs, and granted viewers"
  on public.scope_headers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_headers.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and PMs can create scope headers" on public.scope_headers;
create policy "Admins and PMs can create scope headers"
  on public.scope_headers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can update scope headers" on public.scope_headers;
create policy "Admins and PMs can update scope headers"
  on public.scope_headers for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can delete scope headers" on public.scope_headers;
create policy "Admins and PMs can delete scope headers"
  on public.scope_headers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Scope points readable by admins, PMs, and granted viewers" on public.scope_points;
create policy "Scope points readable by admins, PMs, and granted viewers"
  on public.scope_points for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_points.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and PMs can create scope points" on public.scope_points;
create policy "Admins and PMs can create scope points"
  on public.scope_points for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can update scope points" on public.scope_points;
create policy "Admins and PMs can update scope points"
  on public.scope_points for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can delete scope points" on public.scope_points;
create policy "Admins and PMs can delete scope points"
  on public.scope_points for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

-- ============================================================
-- 6. scope_items.
-- ============================================================
drop policy if exists "Scope items readable by admins, PMs, and granted viewers" on public.scope_items;
create policy "Scope items readable by admins, PMs, and granted viewers"
  on public.scope_items for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_items.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and PMs can create scope items" on public.scope_items;
create policy "Admins and PMs can create scope items"
  on public.scope_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can update scope items" on public.scope_items;
create policy "Admins and PMs can update scope items"
  on public.scope_items for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can delete scope items" on public.scope_items;
create policy "Admins and PMs can delete scope items"
  on public.scope_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

-- ============================================================
-- 7. scope_item_assignments.
-- ============================================================
drop policy if exists "Scope item assignments readable by admins, PMs, and granted viewers" on public.scope_item_assignments;
create policy "Scope item assignments readable by admins, PMs, and granted viewers"
  on public.scope_item_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
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
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can delete scope item assignments" on public.scope_item_assignments;
create policy "Admins and PMs can delete scope item assignments"
  on public.scope_item_assignments for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins and PMs can update scope item assignments" on public.scope_item_assignments;
create policy "Admins and PMs can update scope item assignments"
  on public.scope_item_assignments for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

-- ============================================================
-- 8. activity_logs: dev sees everything (including their own actions);
--    admins/PMs/granted viewers see everything EXCEPT rows whose actor
--    is the dev account. Insert gains dev. New dev-only delete (nothing
--    could delete a log row before this).
-- ============================================================
drop policy if exists "Activity logs readable by admins, PMs, and granted viewers" on public.activity_logs;
drop policy if exists "Activity logs readable by admins, PMs, dev, and granted viewers, minus hidden dev rows" on public.activity_logs;
create policy "Activity logs readable by admins, PMs, dev, and granted viewers, minus hidden dev rows"
  on public.activity_logs for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dev')
    or (
      (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'project_manager')
        )
        or exists (
          select 1 from public.property_access pa
          where pa.property_id = activity_logs.property_id and pa.profile_id = auth.uid()
        )
      )
      and not exists (
        select 1 from public.profiles actor
        where actor.id = activity_logs.actor_id and actor.role = 'dev'
      )
    )
  );

drop policy if exists "Admins, PMs, and granted viewers can log activity" on public.activity_logs;
create policy "Admins, PMs, and granted viewers can log activity"
  on public.activity_logs for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
      )
      or exists (
        select 1 from public.property_access pa
        where pa.property_id = activity_logs.property_id and pa.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "Dev can delete activity log rows" on public.activity_logs;
create policy "Dev can delete activity log rows"
  on public.activity_logs for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dev')
  );

-- ============================================================
-- 9. entries.
-- ============================================================
drop policy if exists "Entries readable by admins, PMs, and granted viewers" on public.entries;
create policy "Entries readable by admins, PMs, and granted viewers"
  on public.entries for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = entries.property_id and pa.profile_id = auth.uid()
    )
  );

drop policy if exists "Admins and project managers can create entries" on public.entries;
create policy "Admins and project managers can create entries"
  on public.entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
    and created_by = auth.uid()
  );

drop policy if exists "Admins can update any entry" on public.entries;
create policy "Admins can update any entry"
  on public.entries for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  );

drop policy if exists "Admins can delete any entry" on public.entries;
create policy "Admins can delete any entry"
  on public.entries for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  );

-- Same show_in_report lock as before, now admin OR dev.
create or replace function public.enforce_entries_show_in_report_lock()
returns trigger
language plpgsql
as $$
begin
  if NEW.show_in_report is distinct from OLD.show_in_report then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev')
    ) then
      raise exception 'Only admins can change show_in_report after an entry is created';
    end if;
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 10. storage.objects (progress-photos bucket).
-- ============================================================
drop policy if exists "Admins and project managers can upload progress photos" on storage.objects;
create policy "Admins and project managers can upload progress photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager', 'dev')
    )
  );

drop policy if exists "Admins can delete any progress photo" on storage.objects;
create policy "Admins can delete any progress photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'dev'))
  );
