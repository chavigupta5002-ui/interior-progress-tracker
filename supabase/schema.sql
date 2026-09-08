-- Interior Progress Tracker — Supabase schema
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- ============================================================
-- 1. Profiles (role + display name, one row per auth user)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('project_manager', 'viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by any authenticated user" on public.profiles;
create policy "Profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ============================================================
-- 2. Properties / projects (e.g. "Kitchen Reno", "Office Fit-out")
-- ============================================================
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;

drop policy if exists "Properties are readable by any authenticated user" on public.properties;
create policy "Properties are readable by any authenticated user"
  on public.properties for select
  to authenticated
  using (true);

drop policy if exists "Project managers can create properties" on public.properties;
create policy "Project managers can create properties"
  on public.properties for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'project_manager'
    )
  );

-- ============================================================
-- 3. Entries (a photo + note posted to a property's timeline)
-- ============================================================
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  photo_path text not null,
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  uploader_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists entries_property_id_created_at_idx
  on public.entries (property_id, created_at desc);

alter table public.entries enable row level security;

drop policy if exists "Entries are readable by any authenticated user" on public.entries;
create policy "Entries are readable by any authenticated user"
  on public.entries for select
  to authenticated
  using (true);

drop policy if exists "Project managers can create entries" on public.entries;
create policy "Project managers can create entries"
  on public.entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'project_manager'
    )
    and created_by = auth.uid()
  );

-- Allow the uploader to edit/delete their own entries (optional, handy for typo fixes).
drop policy if exists "Uploaders can update their own entries" on public.entries;
create policy "Uploaders can update their own entries"
  on public.entries for update
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "Uploaders can delete their own entries" on public.entries;
create policy "Uploaders can delete their own entries"
  on public.entries for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- 4. Realtime: make sure entries broadcasts inserts to subscribers
-- ============================================================
alter publication supabase_realtime add table public.entries;

-- ============================================================
-- 5. Storage bucket for photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- Anyone authenticated can view photos (bucket is also public for simple <img> access).
drop policy if exists "Authenticated users can read progress photos" on storage.objects;
create policy "Authenticated users can read progress photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'progress-photos');

drop policy if exists "Public can read progress photos" on storage.objects;
create policy "Public can read progress photos"
  on storage.objects for select
  to public
  using (bucket_id = 'progress-photos');

-- Only project managers can upload photos.
drop policy if exists "Project managers can upload progress photos" on storage.objects;
create policy "Project managers can upload progress photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'project_manager'
    )
  );

drop policy if exists "Uploaders can delete their own progress photos" on storage.objects;
create policy "Uploaders can delete their own progress photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'progress-photos' and owner = auth.uid());
