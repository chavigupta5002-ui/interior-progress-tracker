-- Migration: reconcile scope_item_assignments and activity_logs
-- (created by 012_assignments_and_logs.sql) ahead of building the
-- assignment/KPI/logs feature. Run this in your Supabase project's SQL
-- editor after 012. Safe to re-run.
--
-- scope_item_assignments: created_at is renamed to assigned_at (an
-- assignment now has a lifecycle, not just a creation time), a new
-- unassigned_at marks when it ended, and the old hard
-- unique(scope_item_id, profile_id) is replaced with a partial unique
-- index so a profile can be assigned, unassigned, and reassigned to the
-- same item over time — only one ACTIVE (unassigned_at is null)
-- assignment per (scope_item_id, profile_id) is allowed.
--
-- activity_logs: adds target_profile_id (who an action was about, e.g.
-- who got assigned/unassigned) and note (free-text detail alongside the
-- existing structured `detail` jsonb column).
--
-- scope_items.checked_by/checked_at: already present from
-- 011_scope_items_hierarchy.sql; the ADD COLUMN IF NOT EXISTS calls
-- below are just a defensive backfill in case that ever drifted.

-- ============================================================
-- scope_item_assignments
-- ============================================================

-- Rename created_at -> assigned_at, but only if this hasn't already run
-- (idempotent: a second run finds assigned_at already there and skips).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scope_item_assignments' and column_name = 'created_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scope_item_assignments' and column_name = 'assigned_at'
  ) then
    alter table public.scope_item_assignments rename column created_at to assigned_at;
  end if;
end $$;

-- Covers a fresh install that never had created_at at all.
alter table public.scope_item_assignments
  add column if not exists assigned_at timestamptz not null default now();

alter table public.scope_item_assignments
  add column if not exists unassigned_at timestamptz;

-- Drop the old hard uniqueness (blocked ever reassigning the same
-- profile to the same item) in favor of a partial index that only
-- constrains active assignments.
alter table public.scope_item_assignments
  drop constraint if exists scope_item_assignments_scope_item_id_profile_id_key;

create unique index if not exists scope_item_assignments_active_unique_idx
  on public.scope_item_assignments (scope_item_id, profile_id)
  where unassigned_at is null;

-- ============================================================
-- activity_logs
-- ============================================================

alter table public.activity_logs
  add column if not exists target_profile_id uuid references public.profiles (id);

alter table public.activity_logs
  add column if not exists note text;

-- ============================================================
-- scope_items — defensive backfill only, see note above.
-- ============================================================

alter table public.scope_items
  add column if not exists checked_by uuid references public.profiles (id);

alter table public.scope_items
  add column if not exists checked_at timestamptz;
