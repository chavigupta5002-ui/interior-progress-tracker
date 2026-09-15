-- Migration: Scope of Work as a 3-level hierarchy (Task / Subtask /
-- Sub-subtask), replacing the flat scope_headers/scope_points model, plus
-- a deadline on properties. Run this in your Supabase project's SQL
-- editor after 010_property_type.sql. Safe to re-run.
--
-- scope_headers/scope_points are NOT dropped here — the app no longer
-- reads or writes them, but they're left in place so no data is lost.
-- Drop them yourself once you've confirmed the new tree is good.
--
-- Percent-complete is never stored: a leaf item (no children) is 0/100%
-- based on checked_at, a parent is the equal-weighted average of its
-- direct children, and a property's overall % is the equal-weighted
-- average of its Task (level-1) items. All computed live by the app.

alter table public.properties
  add column if not exists deadline date;

create table if not exists public.scope_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  parent_id uuid references public.scope_items (id) on delete cascade,
  level smallint not null check (level in (1, 2, 3)),
  title text not null,
  position integer not null default 0,
  deadline date,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists scope_items_property_id_idx on public.scope_items (property_id);
create index if not exists scope_items_parent_id_idx on public.scope_items (parent_id);

-- Enforces the hierarchy the app relies on: level 1 has no parent; level
-- 2's parent must be a level-1 row; level 3's parent must be a level-2
-- row; and a child's property_id must always match its parent's.
create or replace function public.enforce_scope_item_hierarchy()
returns trigger
language plpgsql
as $$
declare
  parent_row public.scope_items%rowtype;
begin
  if NEW.level = 1 then
    if NEW.parent_id is not null then
      raise exception 'Level 1 scope_items (Tasks) must have parent_id = null';
    end if;
    return NEW;
  end if;

  if NEW.level not in (2, 3) then
    raise exception 'scope_items.level must be 1, 2, or 3';
  end if;

  if NEW.parent_id is null then
    raise exception 'Level % scope_items must have a parent_id', NEW.level;
  end if;

  select * into parent_row from public.scope_items where id = NEW.parent_id;
  if not found then
    raise exception 'parent_id % does not exist', NEW.parent_id;
  end if;

  if parent_row.level <> NEW.level - 1 then
    raise exception 'Level % item must have a level % parent (got level %)',
      NEW.level, NEW.level - 1, parent_row.level;
  end if;

  if parent_row.property_id <> NEW.property_id then
    raise exception 'scope_items.property_id must match its parent''s property_id';
  end if;

  return NEW;
end;
$$;

drop trigger if exists scope_items_hierarchy_check on public.scope_items;
create trigger scope_items_hierarchy_check
  before insert or update on public.scope_items
  for each row
  execute function public.enforce_scope_item_hierarchy();

alter table public.scope_items enable row level security;

-- Visibility matches properties/entries: admins/PMs see everything,
-- viewers only see the scope for properties they've been granted.
drop policy if exists "Scope items readable by admins, PMs, and granted viewers" on public.scope_items;
create policy "Scope items readable by admins, PMs, and granted viewers"
  on public.scope_items for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
    or exists (
      select 1 from public.property_access pa
      where pa.property_id = scope_items.property_id and pa.profile_id = auth.uid()
    )
  );

-- Admins and project managers can define and manage the scope tree:
-- add/remove items at any level, and check/uncheck any leaf item
-- (checking is a shared team action, not restricted to whoever created
-- the item).
drop policy if exists "Admins and PMs can create scope items" on public.scope_items;
create policy "Admins and PMs can create scope items"
  on public.scope_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can update scope items" on public.scope_items;
create policy "Admins and PMs can update scope items"
  on public.scope_items for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

drop policy if exists "Admins and PMs can delete scope items" on public.scope_items;
create policy "Admins and PMs can delete scope items"
  on public.scope_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'project_manager')
    )
  );

-- Realtime, guarded so this migration can be re-run safely.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scope_items'
  ) then
    alter publication supabase_realtime add table public.scope_items;
  end if;
end $$;
