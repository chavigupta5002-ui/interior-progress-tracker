# Interior Progress Tracker

A mobile-friendly React + Supabase app for tracking on-site construction/renovation
progress across multiple properties: Project Managers upload timestamped, named
photo + note updates; Viewers watch the timeline update live; anyone can pull a
date-filtered PDF report.

## Stack

- **Frontend**: React + TypeScript + Vite, React Router
- **Backend**: Supabase (Postgres + Auth + Storage + Realtime)
- **PDF export**: jsPDF
- **Hosting**: Vercel

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project (free tier is fine).
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. In **Project Settings → Authentication → Providers**, ensure **Email** is enabled.
   For quick local testing you can disable "Confirm email" under
   **Authentication → Sign In / Providers → Email** so accounts are usable immediately
   after signup (re-enable it for production).
4. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates:
   - `profiles` (id, display_name, role, created_at) with RLS
   - `properties` (id, name, description, created_by, created_at) with RLS
   - `property_access` (per-property viewer grants) with RLS
   - `scope_headers` / `scope_points` (the Scope of Work checklist) with RLS
   - `entries` (id, property_id, photo_paths, note, show_in_report, created_by,
     uploader_name, created_at) with RLS
   - the `progress-photos` Storage bucket + storage policies
   - adds `entries`, `scope_headers`, and `scope_points` to the `supabase_realtime`
     publication for live updates

Only users whose `profiles.role` is `admin` or `project_manager` can insert properties,
entries, or storage objects — Viewers are read-only at the database level (and further
scoped to properties they've been granted access to), not just in the UI. Admins can
also edit/delete any entry and delete a property outright; project managers can only
edit/delete entries they uploaded. See [Roles & access](#roles--access) below.

**Already ran `schema.sql` before?** Run these migrations, in order, against an
existing database (fresh installs following the steps below already get all of this
from `schema.sql` directly):
- [`supabase/migrations/002_multi_photo_entries.sql`](supabase/migrations/002_multi_photo_entries.sql)
  — entries store multiple photos per update (`photo_paths text[]` instead of a single
  `photo_path`); backfills existing photos into the array column and drops the old one.
- [`supabase/migrations/003_property_access_and_admin.sql`](supabase/migrations/003_property_access_and_admin.sql)
  — adds the `admin` role and per-property viewer access.
- [`supabase/migrations/004_admin_entry_and_property_delete.sql`](supabase/migrations/004_admin_entry_and_property_delete.sql)
  — lets admins edit/delete any entry and delete a property (with its entries).
- [`supabase/migrations/005_scope_of_work.sql`](supabase/migrations/005_scope_of_work.sql)
  — adds the Scope of Work checklist (`scope_headers` / `scope_points`) that drives the
  property's progress bar.
- [`supabase/migrations/006_entries_report_flag.sql`](supabase/migrations/006_entries_report_flag.sql)
  — adds `entries.show_in_report`, the "Show this note in report" flag.
- [`supabase/migrations/007_fix_entries_update_recursion.sql`](supabase/migrations/007_fix_entries_update_recursion.sql)
  — fixes an "infinite recursion detected in policy for relation 'entries'" error
  on entries updates (introduced by migration 006's uploader-update policy).
- [`supabase/migrations/008_fix_entries_update_rls_violation.sql`](supabase/migrations/008_fix_entries_update_rls_violation.sql)
  — replaces 007's fix (which could still wrongly reject legitimate edits) with a
  BEFORE UPDATE trigger that enforces the show_in_report lock instead of RLS.
- [`supabase/migrations/009_reassert_admin_delete_policies.sql`](supabase/migrations/009_reassert_admin_delete_policies.sql)
  — re-applies the four admin policies from migration 004 (update/delete any entry,
  delete a property, delete any progress photo). Run this if admin deletes fail with
  "Nothing was deleted" — it means 004 was never actually applied.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. Sign up twice — once as a **Project Manager**, once as
a **Viewer** — to see both roles. Role is chosen at signup in this MVP; if you want
tighter control in production, remove the role picker from the signup form and set
roles manually via the `profiles` table (or build an admin screen).

## 4. How it works

- **Auth**: Supabase Auth (`auth.users`) handles email/password login. Each user gets
  a row in `public.profiles` storing their chosen display name and role.
- **Properties**: any authenticated user can view the property list; only Project
  Managers can create new properties (`src/pages/Properties.tsx`).
- **Timeline**: `src/pages/PropertyDetail.tsx` loads a property's entries and opens a
  Supabase Realtime channel (`postgres_changes` on `entries` filtered by
  `property_id`) so new uploads from any device appear instantly without a refresh.
- **Uploads**: `src/components/PhotoUploadForm.tsx` lets a Project Manager attach
  multiple photos to one update. Each photo uploads to the `progress-photos`
  Storage bucket, then a single row is inserted into `entries` with the note,
  `photo_paths` array, `created_by`, and `uploader_name` (the display name captured
  at signup) — `created_at` is stamped automatically by Postgres. Each entry renders
  as a small thumbnail carousel (`src/components/Carousel.tsx`); tapping a thumbnail
  opens a fullscreen lightbox (`src/components/Lightbox.tsx`) with swipe/arrow
  navigation between that entry's photos.
- **Reports**: `src/pages/Reports.tsx` lets either role pick a property and a single
  day, a date range, or several individual days, then renders the matching entries
  and can export them to a PDF (`src/lib/pdf.ts`) with photos, notes, timestamps, and
  uploader names embedded.

## 5. Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In [Vercel](https://vercel.com), **Add New Project** → import the repo. Vercel
   auto-detects Vite; defaults (`npm run build`, output directory `dist`) work as-is.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the same values from your `.env`.
4. Deploy. `vercel.json` in this repo adds an SPA rewrite so client-side routes like
   `/properties/:id` and `/reports` work on refresh/direct-link.
5. In Supabase → **Authentication → URL Configuration**, add your Vercel domain
   (e.g. `https://your-app.vercel.app`) to the allowed Site URL / Redirect URLs.

## Project structure

```
src/
  context/AuthContext.tsx   # session, profile, sign up/in/out
  components/               # Navbar, ProtectedRoute, PhotoUploadForm, TimelineEntry
  pages/                    # Login, Signup, Properties, PropertyDetail, Reports
  lib/supabaseClient.ts     # Supabase client + storage bucket name
  lib/pdf.ts                # PDF report generation
supabase/schema.sql         # full DB schema, RLS policies, storage bucket + policies
```

## Roles & access

- New signups always start as `viewer` (enforced by RLS, not just the UI).
- `project_manager` / `admin` can only be granted by an existing `admin`, by
  updating the `role` column on `public.profiles`.
- There's no bootstrap admin out of the box. After running `schema.sql`, sign
  up normally, then promote yourself from the Supabase SQL editor (which
  bypasses RLS):
  ```sql
  update public.profiles set role = 'admin' where id = '<your-user-id>';
  ```
- Viewers only see properties they've been granted access to via
  `public.property_access`. Admins and project managers grant/revoke that
  access by inserting/deleting rows in that table (there's no dedicated admin
  UI yet — use the Supabase table editor, or build one on top of the RLS
  policies in `supabase/schema.sql`).

## Notes / follow-ups worth considering

- No in-app UI yet for promoting users or granting property access — both are
  currently done via the Supabase dashboard. Worth building a small admin
  page on top of the `profiles.role` and `property_access` tables above.
- Large photo libraries: consider a paginated/infinite-scroll timeline and
  Supabase image transforms if properties accumulate hundreds of photos.
- Email confirmation is a Supabase project setting — enable it before going live.
