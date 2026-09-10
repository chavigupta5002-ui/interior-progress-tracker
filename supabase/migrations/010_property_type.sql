-- Migration: property type (Homestay / Hotel) on properties.
-- Run this in your Supabase project's SQL editor after
-- 009_reassert_admin_delete_policies.sql. Safe to re-run.
--
-- No RLS changes needed — the existing insert/select policies on
-- properties aren't column-specific.

alter table public.properties
  add column if not exists property_type text not null default 'hotel';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass and conname = 'properties_property_type_check'
  ) then
    alter table public.properties
      add constraint properties_property_type_check check (property_type in ('homestay', 'hotel'));
  end if;
end $$;
