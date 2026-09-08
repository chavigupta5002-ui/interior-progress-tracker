-- Migration: support multiple photos per entry.
-- Run this in your Supabase project's SQL editor if you already ran the
-- original supabase/schema.sql (which had a single `photo_path` column).
-- Safe to re-run.

-- 1. Add the new array column.
alter table public.entries
  add column if not exists photo_paths text[] not null default '{}';

-- 2. Backfill existing single-photo rows into the array column.
update public.entries
set photo_paths = array[photo_path]
where photo_path is not null and photo_paths = '{}';

-- 3. Drop the old column now that data is migrated.
alter table public.entries
  drop column if exists photo_path;
