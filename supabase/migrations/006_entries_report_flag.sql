-- Migration: "Show this note in report" flag on entries.
-- Run this in your Supabase project's SQL editor after
-- 005_scope_of_work.sql. Safe to re-run.

alter table public.entries add column if not exists show_in_report boolean not null default false;

-- Admins can already update any entry (existing "Admins can update any
-- entry" policy, unaffected by this migration). Project managers can
-- only set this flag at creation time (via the insert policy, which
-- already allows any value on their own new row) — lock it from
-- changing on their own subsequent updates, same pattern used to stop
-- self-role-promotion on profiles.
drop policy if exists "Uploaders can update their own entries" on public.entries;
create policy "Uploaders can update their own entries"
  on public.entries for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and show_in_report = (select e.show_in_report from public.entries e where e.id = entries.id)
  );
