-- Migration: add the missing UPDATE policy on scope_item_assignments.
-- Run this in your Supabase project's SQL editor after 013. Safe to
-- re-run.
--
-- Bug: 012_assignments_and_logs.sql added SELECT, INSERT, and DELETE
-- policies for scope_item_assignments, but no UPDATE policy. Unassigning
-- someone works by setting unassigned_at = now() on their active row (an
-- UPDATE, not a DELETE — see 013_reconcile_assignments_and_logs.sql),
-- so with RLS enabled and no matching UPDATE policy, every unassign was
-- silently denied by the default-deny rule. This adds the same
-- admin/PM check already used for insert and delete.

drop policy if exists "Admins and PMs can update scope item assignments" on public.scope_item_assignments;
create policy "Admins and PMs can update scope item assignments"
  on public.scope_item_assignments for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );
