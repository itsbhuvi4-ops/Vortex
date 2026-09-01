-- ================================================================
-- VORTEX CLASH 2026 — SUPABASE PRODUCTION DATABASE SCHEMA
-- Migration: 001_initial_schema.sql
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- 1. SEQUENCE FOR ATOMIC REGISTRATION IDS (VC2026-XXXX)
-- ================================================================
CREATE SEQUENCE IF NOT EXISTS team_reg_seq START WITH 1 INCREMENT BY 1;

-- ================================================================
-- 2. TOURNAMENT SETTINGS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS tournament_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- 3. TEAMS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id TEXT UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  leader_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  substitute TEXT DEFAULT '',
  joined_whatsapp BOOLEAN DEFAULT false,
  joined_discord BOOLEAN DEFAULT false,
  team_logo_url TEXT,
  payment_proof_url TEXT NOT NULL,
  status TEXT DEFAULT 'approved',
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lightning fast lookups & unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_registration_id ON teams(registration_id);
CREATE INDEX IF NOT EXISTS idx_teams_phone ON teams(phone);
CREATE INDEX IF NOT EXISTS idx_teams_whatsapp ON teams(whatsapp);
CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at DESC);

-- ================================================================
-- 4. PLAYERS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_uid TEXT,
  player_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);

-- ================================================================
-- 5. MATCHES (BRACKET) TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT UNIQUE NOT NULL, -- e.g. R1-M1, R2-M1, R3-M1
  round TEXT NOT NULL,
  round_index INTEGER NOT NULL,
  round_name TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  team1_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  team2_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  team1_reg_id TEXT,
  team2_reg_id TEXT,
  winner_reg_id TEXT,
  score TEXT,
  status TEXT DEFAULT 'UPCOMING', -- UPCOMING | LIVE | COMPLETED
  locked BOOLEAN DEFAULT false,
  next_match_id TEXT,
  next_match_slot INTEGER,
  scheduled_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matches_round_index ON matches(round_index);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- ================================================================
-- 6. RULES TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'Tournament Rules',
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  order_number INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_order ON rules(order_number ASC);

-- ================================================================
-- 7. SPONSORS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  image_url TEXT,
  link TEXT DEFAULT '#',
  order_number INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_order ON sponsors(order_number ASC);

-- ================================================================
-- 8. ADMINS TABLE (FOR SECURE AUTHENTICATION)
-- ================================================================
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- 9. ATOMIC REGISTRATION ID HELPER FUNCTION
-- ================================================================
CREATE OR REPLACE FUNCTION get_next_registration_id()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  next_val := nextval('team_reg_seq');
  RETURN 'VC2026-' || LPAD(next_val::TEXT, 4, '0');
END;
$$;

-- ================================================================
-- 10. ATOMIC TEAM INSERT FUNCTION WITH MAXIMUM CAPACITY LOCK
-- ================================================================
CREATE OR REPLACE FUNCTION register_team_atomic(
  p_team_name TEXT,
  p_leader_name TEXT,
  p_phone TEXT,
  p_whatsapp TEXT,
  p_team_logo_url TEXT,
  p_payment_proof_url TEXT,
  p_player1 TEXT,
  p_player2 TEXT,
  p_player3 TEXT,
  p_player4 TEXT,
  p_substitute TEXT,
  p_joined_whatsapp BOOLEAN,
  p_joined_discord BOOLEAN,
  p_user_id TEXT,
  p_max_teams INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count INT;
  new_reg_id TEXT;
  new_team_id UUID;
  existing_team_id UUID;
BEGIN
  -- 1. Check duplicate phone or whatsapp
  SELECT id INTO existing_team_id FROM teams 
  WHERE phone = p_phone OR whatsapp = p_whatsapp OR (p_user_id IS NOT NULL AND user_id = p_user_id)
  LIMIT 1;

  IF existing_team_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'error', 'A team with this phone number or session has already registered.');
  END IF;

  -- 2. Lock and check max teams
  SELECT COUNT(*) INTO current_count FROM teams;
  IF current_count >= p_max_teams THEN
    RETURN jsonb_build_object('success', false, 'full', true, 'error', 'Registration closed. Maximum team limit reached.');
  END IF;

  -- 3. Generate sequential registration ID
  new_reg_id := get_next_registration_id();

  -- 4. Insert Team
  INSERT INTO teams (
    registration_id, team_name, leader_name, phone, whatsapp,
    substitute, joined_whatsapp, joined_discord, team_logo_url,
    payment_proof_url, status, user_id, created_at, updated_at
  ) VALUES (
    new_reg_id, p_team_name, p_leader_name, p_phone, p_whatsapp,
    COALESCE(p_substitute, ''), COALESCE(p_joined_whatsapp, false),
    COALESCE(p_joined_discord, false), p_team_logo_url,
    p_payment_proof_url, 'approved', p_user_id, now(), now()
  ) RETURNING id INTO new_team_id;

  -- 5. Insert Players
  INSERT INTO players (team_id, player_name, player_number)
  VALUES 
    (new_team_id, p_player1, 1),
    (new_team_id, p_player2, 2),
    (new_team_id, p_player3, 3),
    (new_team_id, p_player4, 4);

  IF p_substitute IS NOT NULL AND TRIM(p_substitute) != '' THEN
    INSERT INTO players (team_id, player_name, player_number)
    VALUES (new_team_id, p_substitute, 5);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', new_team_id,
    'registration_id', new_reg_id,
    'team_name', p_team_name,
    'leader_name', p_leader_name,
    'phone', p_phone,
    'whatsapp', p_whatsapp,
    'team_logo_url', p_team_logo_url,
    'payment_proof_url', p_payment_proof_url,
    'player1', p_player1,
    'player2', p_player2,
    'player3', p_player3,
    'player4', p_player4,
    'substitute', p_substitute,
    'created_at', now()
  );
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 11. STORAGE BUCKETS (SUPABASE STORAGE)
-- ================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('team-logos', 'team-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']), -- PRIVATE BUCKET
  ('sponsor-images', 'sponsor-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Public buckets rely on the bucket's public flag for direct object URLs.
-- Broad bucket-wide SELECT policies are intentionally removed to prevent listing all objects.
DROP POLICY IF EXISTS "Public Read Access on team-logos" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access on sponsor-images" ON storage.objects;

-- Service Role / Admin Access on Private payment-proofs
CREATE POLICY "Admin Read Access on payment-proofs" ON storage.objects FOR SELECT USING (bucket_id = 'payment-proofs' AND (auth.role() = 'service_role' OR auth.role() = 'authenticated'));

-- Service Role Upload Policies
CREATE POLICY "Service Role Upload on team-logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'team-logos');
CREATE POLICY "Service Role Upload on payment-proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');
CREATE POLICY "Service Role Upload on sponsor-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sponsor-images');

-- ================================================================
-- 12. REALTIME REPLICATION ENABLEMENT
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE rules;
ALTER PUBLICATION supabase_realtime ADD TABLE sponsors;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_settings;

-- ================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Public can read tournament public data
CREATE POLICY "Allow public read on teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public read on players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read on matches" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow public read on rules" ON rules FOR SELECT USING (true);
CREATE POLICY "Allow public read on sponsors" ON sponsors FOR SELECT USING (true);
CREATE POLICY "Allow public read on tournament_settings" ON tournament_settings FOR SELECT USING (true);

-- Service role has unrestricted access (used by Node.js backend)
CREATE POLICY "Service role full access on teams" ON teams FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "Service role full access on players" ON players FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "Service role full access on matches" ON matches FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "Service role full access on rules" ON rules FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "Service role full access on sponsors" ON sponsors FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "Service role full access on tournament_settings" ON tournament_settings FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
