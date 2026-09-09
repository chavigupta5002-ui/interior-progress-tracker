-- Migration: fix "infinite recursion detected in policy for relation
-- 'entries'" on entries updates. Run this in your Supabase project's
-- SQL editor after 006_entries_report_flag.sql. Safe to re-run.
--
-- Root cause: the "Uploaders can update their own entries" policy's
-- WITH CHECK looked up the entry's *current* show_in_report value via
-- a subquery on entries itself:
--   show_in_report = (select e.show_in_report from public.entries e where e.id = entries.id)
-- entries' own SELECT policy is correlated (it checks
-- entries.property_id against property_access, unlike e.g. profiles'
-- trivial `using (true)`), so Postgres has to re-apply RLS to that
-- inner reference — which loops back into evaluating the very policy
-- being checked, throwing "infinite recursion detected in policy for
-- relation 'entries'" on every entries UPDATE (note edits, and the
-- admin show_in_report toggle both hit this).
--
-- Fix: look the value up through a SECURITY DEFINER function. It runs
-- with the function owner's privileges, so its internal query bypasses
-- RLS on entries entirely instead of re-entering this policy.

create or replace function public.entry_show_in_report(p_entry_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select show_in_report from public.entries where id = p_entry_id;
$$;

drop policy if exists "Uploaders can update their own entries" on public.entries;
create policy "Uploaders can update their own entries"
  on public.entries for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and show_in_report = public.entry_show_in_report(id)
  );
