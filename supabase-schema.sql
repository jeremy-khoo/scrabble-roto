-- Supabase Database Schema for Scrabble Roto App (Multi-Tournament)

-- Events/Tournaments table
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    registration_open BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rating bands table (per event)
CREATE TABLE rating_bands (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    division INTEGER NOT NULL, -- 1 or 2
    min_rating INTEGER NOT NULL,
    max_rating INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, division, name)
);

-- Players table (per event)
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    current_rating INTEGER NOT NULL,
    original_rating INTEGER NOT NULL, -- Rating when first added to event
    current_division INTEGER NOT NULL, -- 1 or 2
    original_division INTEGER NOT NULL, -- Division when first added to event
    current_rating_band_id INTEGER REFERENCES rating_bands(id),
    original_rating_band_id INTEGER REFERENCES rating_bands(id), -- Band when first added
    external_id VARCHAR(100), -- ID from external API
    is_active BOOLEAN DEFAULT true,
    dropped_out BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, external_id)
);

-- Teams table (per event)
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_valid BOOLEAN DEFAULT true, -- False if any player dropped out or changed rating band
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, name) -- Ensure unique team names per event
);

-- Team players junction table
CREATE TABLE team_players (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id),
    rating_band_id INTEGER REFERENCES rating_bands(id), -- Band they were drafted in
    drafted_rating INTEGER, -- Player's rating when drafted (populated by trigger)
    drafted_division INTEGER, -- Player's division when drafted (populated by trigger)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, rating_band_id) -- One player per rating band per team
);

-- Profiles table for user data
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sample event and rating bands
INSERT INTO events (name, description, start_date, end_date) VALUES
    ('NASPA Scrabble Players Championship 2025', 'National Scrabble Championship 2025', '2025-08-09', '2025-08-14');

-- Get the event ID for rating bands (adjust based on actual event)
INSERT INTO rating_bands (event_id, division, name, min_rating, max_rating) VALUES
    (1, 1, 'Division 1 - GOAT', 2150, 9999),
    (1, 1, 'Division 1 - 2050+', 2050, 2149),
    (1, 1, 'Division 1 - 1950-2050', 1950, 2049),
    (1, 1, 'Division 1 - 1850-1950', 1850, 1949),
    (1, 1, 'Division 1 - < 1850', 1, 1849),
    (1, 2, 'Division 2 - 1700+', 1700, 1799),
    (1, 2, 'Division 2 - 1600-1700', 1600, 1699),
    (1, 2, 'Division 2 - 1500-1600', 1500, 1599),
    (1, 2, 'Division 2 - < 1500', 1, 1499);


-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can view events, rating bands, and players
CREATE POLICY "Everyone can view events" ON events FOR SELECT USING (true);
CREATE POLICY "Admins can manage events" ON events FOR ALL USING (
    is_admin_user(auth.uid())
);

CREATE POLICY "Everyone can view rating bands" ON rating_bands FOR SELECT USING (true);
CREATE POLICY "Admins can manage rating bands" ON rating_bands FOR ALL USING (
    is_admin_user(auth.uid())
);

CREATE POLICY "Everyone can view players" ON players FOR SELECT USING (true);
CREATE POLICY "Admins can manage players" ON players FOR ALL USING (
    is_admin_user(auth.uid())
);

-- Users can view all teams but only modify their own
CREATE POLICY "Users can view all teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Users can create their own teams" ON teams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own teams" ON teams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own teams" ON teams FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all teams" ON teams FOR ALL USING (
    is_admin_user(auth.uid())
);

-- Team players policies
CREATE POLICY "Users can view all team players" ON team_players FOR SELECT USING (true);
CREATE POLICY "Users can manage their own team players" ON team_players FOR ALL USING (
    team_id IN (SELECT id FROM teams WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can manage all team players" ON team_players FOR ALL USING (
    is_admin_user(auth.uid())
);

-- Helper function to check admin status without recursion
CREATE OR REPLACE FUNCTION is_admin_user(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Use a direct query without RLS to avoid recursion
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id AND is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles policies - Show usernames but not emails (except to admins and self)
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
    auth.uid() = id OR is_admin_user(auth.uid())
);
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (
    auth.uid() = id OR is_admin_user(auth.uid())
);

-- Public view for usernames only (no emails)
CREATE VIEW public_profiles AS
SELECT id, username, created_at
FROM profiles;

-- Function to determine rating band for a given rating, division and event
CREATE OR REPLACE FUNCTION get_rating_band(p_rating INTEGER, p_division INTEGER, p_event_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    band_id INTEGER;
BEGIN
    SELECT id INTO band_id
    FROM rating_bands
    WHERE event_id = p_event_id
      AND division = p_division
      AND p_rating >= min_rating
      AND p_rating <= max_rating
    LIMIT 1;

    RETURN band_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update player rating band when rating changes
CREATE OR REPLACE FUNCTION update_player_rating_band()
RETURNS TRIGGER AS $$
DECLARE
    new_band_id INTEGER;
BEGIN
    -- Calculate new rating band using division + rating
    new_band_id := get_rating_band(NEW.current_rating, NEW.current_division, NEW.event_id);

    -- Update current rating band
    NEW.current_rating_band_id := new_band_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update team validity when players change from their original state
CREATE OR REPLACE FUNCTION update_team_validity()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark teams invalid if they contain players who:
    -- 1. Dropped out, OR
    -- 2. Changed rating or division from their ORIGINAL state (when first added to event)
    --    AND the team drafted them under the original conditions
    UPDATE teams
    SET is_valid = false
    WHERE id IN (
        SELECT DISTINCT tp.team_id
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE p.dropped_out = true
           OR (
               -- Player's original stats have changed since they were first added
               (p.original_rating != p.current_rating OR p.original_division != p.current_division)
               AND 
               -- Team drafted them based on the original conditions
               (tp.drafted_rating = p.original_rating AND tp.drafted_division = p.original_division)
           )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_rating_band_trigger
    BEFORE UPDATE ON players
    FOR EACH ROW
    WHEN (OLD.current_rating IS DISTINCT FROM NEW.current_rating OR OLD.current_division IS DISTINCT FROM NEW.current_division)
    EXECUTE FUNCTION update_player_rating_band();

CREATE TRIGGER player_change_trigger
    AFTER UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_team_validity();

-- Trigger to set original rating band when player is first created
CREATE OR REPLACE FUNCTION set_original_rating_band()
RETURNS TRIGGER AS $$
BEGIN
    NEW.original_rating_band_id := get_rating_band(NEW.current_rating, NEW.current_division, NEW.event_id);
    NEW.current_rating_band_id := NEW.original_rating_band_id;
    NEW.original_rating := NEW.current_rating;
    NEW.original_division := NEW.current_division;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_original_rating_band_trigger
    BEFORE INSERT ON players
    FOR EACH ROW
    EXECUTE FUNCTION set_original_rating_band();

-- Function to populate drafted snapshot data when team_players are created
CREATE OR REPLACE FUNCTION set_drafted_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Populate drafted_rating and drafted_division from current player state
    SELECT current_rating, current_division 
    INTO NEW.drafted_rating, NEW.drafted_division
    FROM players 
    WHERE id = NEW.player_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_drafted_snapshot_trigger
    BEFORE INSERT ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION set_drafted_snapshot();

-- Function to automatically create profile when user signs up
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
      INSERT INTO public.profiles (id, username, email)
      VALUES (
          NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
          NEW.email
      );
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Trigger to automatically create profile for new users
  CREATE OR REPLACE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: Add unique constraint to existing database
-- Run this if the database already exists without the constraint:
-- ALTER TABLE teams ADD CONSTRAINT teams_event_id_name_key UNIQUE (event_id, name);