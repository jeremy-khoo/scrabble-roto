-- Migration script: Add division support to existing database
-- Run this script to update an existing database with division support

-- 1. Add division column to rating_bands table
ALTER TABLE rating_bands ADD COLUMN IF NOT EXISTS division INTEGER;

-- 2. Add division columns to players table  
ALTER TABLE players ADD COLUMN IF NOT EXISTS current_division INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS original_division INTEGER;

-- 3. Add snapshot columns to team_players table
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS drafted_rating INTEGER;
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS drafted_division INTEGER;

-- 4. Populate division field in existing rating_bands based on names
UPDATE rating_bands 
SET division = 1 
WHERE name LIKE '%Division 1%' OR name LIKE '%Div 1%';

UPDATE rating_bands 
SET division = 2 
WHERE name LIKE '%Division 2%' OR name LIKE '%Div 2%';

-- 5. Set division as NOT NULL after populating data
ALTER TABLE rating_bands ALTER COLUMN division SET NOT NULL;

-- 6. Update unique constraint for rating_bands to include division
ALTER TABLE rating_bands DROP CONSTRAINT IF EXISTS rating_bands_event_id_name_key;
ALTER TABLE rating_bands ADD CONSTRAINT rating_bands_event_id_division_name_key UNIQUE (event_id, division, name);

-- 7. Populate division fields in existing players based on their current rating band
UPDATE players 
SET current_division = rb.division,
    original_division = rb.division
FROM rating_bands rb 
WHERE players.current_rating_band_id = rb.id 
  AND players.current_division IS NULL;

-- 8. Set default division for players without rating band (shouldn't happen but just in case)
UPDATE players 
SET current_division = CASE 
    WHEN current_rating >= 1800 THEN 1 
    ELSE 2 
END,
original_division = CASE 
    WHEN current_rating >= 1800 THEN 1 
    ELSE 2 
END
WHERE current_division IS NULL;

-- 9. Set division as NOT NULL after populating data
ALTER TABLE players ALTER COLUMN current_division SET NOT NULL;
ALTER TABLE players ALTER COLUMN original_division SET NOT NULL;

-- 10. Populate snapshot data in existing team_players
UPDATE team_players 
SET drafted_rating = p.original_rating,
    drafted_division = p.original_division
FROM players p 
WHERE team_players.player_id = p.id 
  AND team_players.drafted_rating IS NULL;

-- 11. Set snapshot fields as NOT NULL after populating data
ALTER TABLE team_players ALTER COLUMN drafted_rating SET NOT NULL;
ALTER TABLE team_players ALTER COLUMN drafted_division SET NOT NULL;

-- 12. Drop triggers first (they depend on functions)
DROP TRIGGER IF EXISTS update_rating_band_trigger ON players;
DROP TRIGGER IF EXISTS player_change_trigger ON players;
DROP TRIGGER IF EXISTS set_original_rating_band_trigger ON players;

-- 13. Now drop and recreate functions with new signatures
DROP FUNCTION IF EXISTS get_rating_band(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS update_player_rating_band();
DROP FUNCTION IF EXISTS update_team_validity();
DROP FUNCTION IF EXISTS set_original_rating_band();

-- 14. Recreate functions with division support
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

-- 15. Recreate triggers

CREATE TRIGGER update_rating_band_trigger
    BEFORE UPDATE ON players
    FOR EACH ROW
    WHEN (OLD.current_rating IS DISTINCT FROM NEW.current_rating OR OLD.current_division IS DISTINCT FROM NEW.current_division)
    EXECUTE FUNCTION update_player_rating_band();

CREATE TRIGGER player_change_trigger
    AFTER UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_team_validity();

CREATE TRIGGER set_original_rating_band_trigger
    BEFORE INSERT ON players
    FOR EACH ROW
    EXECUTE FUNCTION set_original_rating_band();

-- 16. Create function to populate drafted snapshot data automatically
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

-- Migration complete!
-- This script has added division support while preserving existing data.
-- The database now automatically captures player snapshots when teams are created.