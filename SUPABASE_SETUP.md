# Vortex Clash 2026 — Supabase & Production Setup Guide

This guide outlines how to configure Supabase PostgreSQL, Supabase Storage, and environment variables for the Vortex Clash 2026 esports tournament platform.

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create an account or sign in.
2. Click **New Project**, choose a name (e.g., `vortex-clash-2026`), select a strong database password, and choose your preferred region.

---

## 2. Run Database Migration

1. In your Supabase Dashboard, navigate to the **SQL Editor** tab on the left sidebar.
2. Click **New query**.
3. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`.
4. Click **Run** to execute the script.

This creates:
- `teams` table (with unique atomic registration numbers `VC2026-XXXX`).
- `players` table (foreign key cascade to teams).
- `matches` table (bracket schedule, teams, winners, lock flags).
- `rules` table (tournament rules and categories).
- `sponsors` table (partners and brand logos).
- `tournament_settings` table (JSONB settings and metadata).
- `admins` table (secure bcrypt hashed credentials).
- Storage buckets: `team-logos`, `payment-proofs`, `sponsor-images`.
- Realtime publication subscriptions on all primary tables.
- Row Level Security (RLS) policies for public reads and service-role writes.

---

## 3. Storage Buckets Verification

1. In Supabase Dashboard, navigate to **Storage**.
2. Verify that the following 3 buckets exist and are marked **Public**:
   - `team-logos`
   - `payment-proofs`
   - `sponsor-images`
3. If not automatically created by SQL, click **New bucket** for each, check **Public bucket**, and set allowed MIME types to `image/jpeg`, `image/png`, `image/webp`.

---

## 4. Obtain API Credentials

1. In Supabase Dashboard, click **Project Settings** (gear icon) > **API**.
2. Copy the following values:
   - **Project URL** -> `SUPABASE_URL`
   - **anon / public** key -> `SUPABASE_ANON_KEY`
   - **service_role / secret** key -> `SUPABASE_SERVICE_ROLE_KEY` *(NEVER expose to browser)*

---

## 5. Environment Variables Setup

Create a `.env` file in the root directory (or set in Vercel Project Settings > Environment Variables):

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SESSION_SECRET=super-secret-production-key-at-least-32-chars
ADMIN_EMAIL=admin@vortexclash.com
ADMIN_PASSWORD=your_secure_admin_password_here
MAX_TEAMS=30
PORT=3000
NODE_ENV=production
```

---

## 6. Migrate Existing Data (Optional)

If you have pre-existing data in `data/database.json` that you want to import into your Supabase database:

```bash
node scripts/migrate-existing-data.js
```

The script will read the old tournament records, upload any local images to Supabase Storage, and insert teams, rules, sponsors, and bracket state into PostgreSQL.

---

## 7. Realtime Sync & Vercel Deployment

- **Realtime**: When an admin selects a match winner or updates rules/sponsors/settings, Supabase Realtime automatically pushes the changes to connected user browsers without requiring page reloads.
- **Vercel**: Deploy directly with `vercel` or link via GitHub. The application runs serverless on Node.js using `vercel.json`.
