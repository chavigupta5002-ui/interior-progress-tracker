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
   - `entries` (id, property_id, photo_path, note, created_by, uploader_name, created_at) with RLS
   - the `progress-photos` Storage bucket + storage policies
   - adds `entries` to the `supabase_realtime` publication for live updates

Only users whose `profiles.role = 'project_manager'` can insert properties, entries,
or storage objects — Viewers are read-only at the database level, not just in the UI.

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
- **Uploads**: `src/components/PhotoUploadForm.tsx` uploads the photo to the
  `progress-photos` Storage bucket, then inserts a row into `entries` with the note,
  `created_by`, and `uploader_name` (the display name captured at signup) —
  `created_at` is stamped automatically by Postgres.
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

## Notes / follow-ups worth considering

- Signup currently lets the user pick their own role. For a real deployment, restrict
  "Project Manager" signups (e.g. an invite code, or admin promotion in the
  `profiles` table) so anyone can't grant themselves upload access.
- Large photo libraries: consider a paginated/infinite-scroll timeline and
  Supabase image transforms if properties accumulate hundreds of photos.
- Email confirmation is a Supabase project setting — enable it before going live.
