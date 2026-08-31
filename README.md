# DS TAMIL GAMING — VORTEX CLASH 2026
### Production Interactive Esports Tournament Platform

A production-ready esports tournament web platform for **DS TAMIL GAMING presents VORTEX CLASH 2026** powered by Node.js, Express, Supabase PostgreSQL, Supabase Storage, and React 18 with Realtime sync.

---

## ⚡ Key Highlights & Features

1. **Production Database & Storage (Supabase)**:
   - **Supabase PostgreSQL**: Permanent database source of truth for teams, players, tournament settings, rules, sponsors, matches, and admin credentials.
   - **Supabase Storage**: Persistent storage buckets for `team-logos`, `payment-proofs`, and `sponsor-images` (rejects files > 5MB and non-image types).
   - **Zero Data Loss**: No ephemeral `/tmp`, local JSON, or local SQLite source-of-truth dependencies in production.

2. **Realtime Live Updates**:
   - Supabase Realtime WebSocket events automatically update user views when admins advance match winners, change bracket schedules, update rules, add sponsors, or adjust tournament capacity without requiring manual browser refresh.
   - Intelligent polling fallback (15-30s) if WebSockets disconnect.

3. **Atomic Team Registration & 30-Team Limit**:
   - Atomic database locking ensures registrations never exceed the strict 30-team limit.
   - Duplicate prevention guards against duplicate submissions by phone number, WhatsApp number, or session ID.
   - Sequential unique registration numbers generated atomically (`VC2026-0001`, `VC2026-0002`, ...).
   - Instant team pass generation with printable confirmation.

4. **Single-Elimination Knockout Bracket Engine**:
   - Automatic Bye generation for non-power-of-two team counts.
   - State control: `UNPUBLISHED` (pre-publish) → `PUBLISHED` (live tournament bracket).
   - Match countdown timer with automatic transition to `MATCH LIVE`.
   - Winner progression: Selecting a match winner automatically advances the squad to the subsequent match slot.
   - Downstream cascade recalculation upon match resets.
   - Grand Final `🏆 TOURNAMENT CHAMPION` showcase card with team logo and title.

5. **Hardened Security & Protected Admin APIs**:
   - Strict `requireAdmin` middleware protecting all mutating operations (teams, matches, sponsors, rules, settings, image uploads, Excel export).
   - Development/debug endpoints disabled with 404 in production.
   - Secure HTTP-only session cookies with dynamic random secret and bcrypt authentication.
   - Protected Excel download (`/api/teams/export-excel`).

6. **Vercel Serverless Ready**:
   - Native Vercel serverless support configured in `vercel.json`.

---

## 📁 Project Structure

```
Vortex/
├── .env.example                       # Production environment variables template
├── SUPABASE_SETUP.md                  # Step-by-step Supabase database & storage setup
├── vercel.json                        # Vercel serverless deployment config
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql     # Supabase SQL schema, triggers, and buckets
├── lib/
│   └── supabase.js                    # Production Supabase PostgreSQL & Storage client
├── scripts/
│   └── migrate-existing-data.js       # Data migration script from JSON to Supabase
├── public/
│   ├── css/
│   │   └── style.css                  # Esports theme, neon glow, bracket styles
│   ├── js/
│   │   └── app.js                     # React 18 frontend with Supabase Realtime
│   └── index.html                     # Main entry point with Tailwind, Lucide, Supabase JS
├── package.json                       # Dependencies and scripts
├── server.js                          # Production Express backend & Knockout engine
└── README.md                          # Platform documentation
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_secret_service_role_key
SESSION_SECRET=your_strong_session_secret
ADMIN_EMAIL=admin@vortexclash.com
ADMIN_PASSWORD=your_secure_admin_password
MAX_TEAMS=30
```

### 3. Run Database Migration
Follow [SUPABASE_SETUP.md](file:///c:/Users/Admin/OneDrive/Desktop/Vortex/SUPABASE_SETUP.md) and execute `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor.

### 4. Migrate Existing Data (Optional)
```bash
node scripts/migrate-existing-data.js
```

### 5. Start the Server
```bash
npm start
```
Visit `http://localhost:3000`.
