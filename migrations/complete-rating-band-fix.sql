-- Complete migration to add drafted_rating_band_id tracking
-- This handles the case where the previous migration failed partway through

-- Step 1: Add the drafted_rating_band_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'team_players' 
                   AND column_name = 'drafted_rating_band_id') THEN
        ALTER TABLE team_players ADD COLUMN drafted_rating_band_id INTEGER REFERENCES rating_bands(id);
    END IF;
END $$;

-- Step 2: Populate drafted_rating_band_id with current rating_band_id values if not already populated
UPDATE team_players 
SET drafted_rating_band_id = rating_band_id 
WHERE drafted_rating_band_id IS NULL;

-- Step 3: Make the column NOT NULL
ALTER TABLE team_players ALTER COLUMN drafted_rating_band_id SET NOT NULL;

-- Step 4: Drop the old unique constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'team_players_team_id_rating_band_id_key') THEN
        ALTER TABLE team_players DROP CONSTRAINT team_players_team_id_rating_band_id_key;
    END IF;
END $$;

-- Step 5: Add the new constraint on drafted_rating_band_id
ALTER TABLE team_players ADD CONSTRAINT team_players_team_id_drafted_rating_band_id_key 
    UNIQUE (team_id, drafted_rating_band_id);

-- Step 6: Now safely update rating_band_id to track current bands
UPDATE team_players tp
SET rating_band_id = p.current_rating_band_id
FROM players p
WHERE tp.player_id = p.id;

-- Step 7: Update the drafted snapshot trigger
CREATE OR REPLACE FUNCTION set_drafted_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Populate drafted_rating, drafted_division, and drafted_rating_band_id from current player state
    SELECT current_rating, current_division, current_rating_band_id
    INTO NEW.drafted_rating, NEW.drafted_division, NEW.drafted_rating_band_id
    FROM players 
    WHERE id = NEW.player_id;
    
    -- Set current rating_band_id to match player's current state initially
    NEW.rating_band_id = NEW.drafted_rating_band_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to keep team_players.rating_band_id in sync with player's current rating band
CREATE OR REPLACE FUNCTION sync_team_player_rating_band()
RETURNS TRIGGER AS $$
BEGIN
    -- Update all team_players records for this player to reflect their current rating band
    UPDATE team_players 
    SET rating_band_id = NEW.current_rating_band_id
    WHERE player_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_team_player_rating_band_trigger ON players;
CREATE TRIGGER sync_team_player_rating_band_trigger
    AFTER UPDATE ON players
    FOR EACH ROW
    WHEN (OLD.current_rating_band_id IS DISTINCT FROM NEW.current_rating_band_id)
    EXECUTE FUNCTION sync_team_player_rating_band();

-- Step 9: Update team validity function to use the correct columns
CREATE OR REPLACE FUNCTION update_team_validity()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark teams invalid if they contain players who:
    -- 1. Dropped out, OR
    -- 2. Changed division from when they were drafted, OR  
    -- 3. Changed to a different rating band than when they were drafted
    UPDATE teams
    SET is_valid = false
    WHERE id IN (
        SELECT DISTINCT tp.team_id
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE p.dropped_out = true
           OR p.current_division != tp.drafted_division
           OR tp.rating_band_id != tp.drafted_rating_band_id  -- current vs drafted band
    );

    -- Mark teams valid again if ALL their players are now valid:
    -- 1. Not dropped out, AND
    -- 2. Back in their drafted division, AND
    -- 3. Back in their drafted rating band
    UPDATE teams
    SET is_valid = true
    WHERE is_valid = false  -- Only check currently invalid teams
      AND id NOT IN (
          SELECT DISTINCT tp.team_id
          FROM team_players tp
          JOIN players p ON tp.player_id = p.id
          WHERE p.dropped_out = true
             OR p.current_division != tp.drafted_division
             OR tp.rating_band_id != tp.drafted_rating_band_id
      );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Update revalidate function
CREATE OR REPLACE FUNCTION revalidate_all_teams()
RETURNS void AS $$
BEGIN
    -- First, mark all teams as valid
    UPDATE teams SET is_valid = true;
    
    -- Then mark invalid teams based on current rules
    UPDATE teams
    SET is_valid = false
    WHERE id IN (
        SELECT DISTINCT tp.team_id
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE p.dropped_out = true
           OR p.current_division != tp.drafted_division
           OR tp.rating_band_id != tp.drafted_rating_band_id
    );
END;
$$ LANGUAGE plpgsql;

-- Step 11: Run the revalidation
SELECT revalidate_all_teams();