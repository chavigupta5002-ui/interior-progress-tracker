-- Migration: fix "new row violates row-level security policy for
-- table 'entries'" on legitimate entry edits. Run this in your
-- Supabase project's SQL editor after
-- 007_fix_entries_update_recursion.sql. Safe to re-run.
--
-- 007 fixed the infinite-recursion error by moving the show_in_report
-- comparison into a SECURITY DEFINER function, but comparing a NEW
-- row's value against a *re-queried* copy of the same row from inside
-- an UPDATE's WITH CHECK is still fragile — it depends on exactly when
-- Postgres considers that re-query's snapshot to include the in-flight
-- update, and got this wrong for plain note edits that never touch
-- show_in_report at all.
--
-- Fix: enforce the "only admins can change show_in_report after
-- creation" rule with a BEFORE UPDATE trigger instead of RLS. Triggers
-- get NEW/OLD as direct in-memory values — no subquery, no snapshot
-- ambiguity — which is the standard, reliable way to protect a single
-- column like this in Postgres. The RLS policy goes back to a plain,
-- non-self-referential check.

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

drop policy if exists "Uploaders can update their own entries" on public.entries;
create policy "Uploaders can update their own entries"
  on public.entries for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- No longer needed now that the rule lives in the trigger above.
drop function if exists public.entry_show_in_report(uuid);
