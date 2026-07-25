# Geo Notes

A responsive web app for leaving notes — text, images, video, audio — pinned to locations on a world map. Notes can be private, shared with specific users by username, or public for everyone.

Built with React + Vite + TypeScript, [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles, and [Supabase](https://supabase.com/) (Postgres, Auth, Storage). Location search is powered by [Nominatim](https://nominatim.org/).

## Features

- Full-screen world map with pinch-zoom, marker clustering, and colored pins by visibility (green = public, orange = shared, gray = private)
- Location search with fly-to navigation
- Add a note by tapping the map, searching, or using your current GPS location
- Each note stores both the date it was posted and a user-selected "date this note is about" (e.g. a photo of a house from a previous year)
- Attach images, video, and audio (up to 50 MB per file), stored privately and served via signed URLs
- Accounts with public usernames; share notes with specific users by username or with named groups
- My Groups panel to create and edit groups you own; group membership is live-linked to note access
- Anonymous visitors can browse all public notes; an account is needed to create notes or see private/shared ones
- Responsive layout: side panel on desktop, bottom sheet on mobile

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key (Dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Apply the database schema

Open the Supabase Dashboard → SQL Editor → New query. For each file below, paste the **entire** contents, click in the editor **without selecting any text** (selected text makes the editor run only the selection), and click Run:

1. [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) — `profiles`, `notes`, `note_shares`, `note_media`, auth trigger, storage bucket
2. [`supabase/migrations/002_groups.sql`](supabase/migrations/002_groups.sql) — user groups, group membership, group note shares, and RLS policies
3. [`supabase/migrations/003_fix_user_groups_select.sql`](supabase/migrations/003_fix_user_groups_select.sql) — fixes group create when the app returns the new row (INSERT RETURNING)
4. [`supabase/migrations/004_notifications.sql`](supabase/migrations/004_notifications.sql) — notification seen timestamp, public toggle, mute list
5. [`supabase/migrations/005_public_author_mutes.sql`](supabase/migrations/005_public_author_mutes.sql) — per-author mutes for public-note notifications
6. [`supabase/migrations/006_note_engagement.sql`](supabase/migrations/006_note_engagement.sql) — note replies and emoji reactions
7. [`supabase/migrations/007_map_public_filter.sql`](supabase/migrations/007_map_public_filter.sql) — Groups panel public map filter prefs (separate from notification mutes)

If group policies were never applied, also run [`supabase/migrations/002b_groups_policies_repair.sql`](supabase/migrations/002b_groups_policies_repair.sql) before step 3.

### 4. (Recommended for local testing) Disable email confirmation

Dashboard → Authentication → Sign In / Up → Email → turn off "Confirm email". Otherwise new users must click a confirmation link before logging in.

### 5. Run

```bash
npm run dev
```

## Notes on external services

- Map tiles are served by openstreetmap.org and search by nominatim.openstreetmap.org, both free with attribution (already included in the map's attribution control). Nominatim allows at most 1 request/second — the search box debounces and rate-limits accordingly.
- Supabase free tier: 500 MB database, 1 GB file storage, 50 MB per-file upload limit (enforced client-side and on the bucket).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — typecheck and build for production (`dist/`)
- `npm run preview` — serve the production build locally
