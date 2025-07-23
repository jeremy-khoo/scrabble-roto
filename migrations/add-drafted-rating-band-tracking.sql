-- Add proper tracking of drafted vs current rating band in team_players
-- Currently tp.rating_band_id is the drafted band, but we need to track current band too

-- Add column for drafted rating band (what the team actually drafted)
ALTER TABLE team_players ADD COLUMN drafted_rating_band_id INTEGER REFERENCES rating_bands(id);

-- Migrate existing data: current rating_band_id becomes drafted_rating_band_id
UPDATE team_players SET drafted_rating_band_id = rating_band_id;

-- Make the new column NOT NULL since it should always be set
ALTER TABLE team_players ALTER COLUMN drafted_rating_band_id SET NOT NULL;

-- Now rating_band_id can track the player's CURRENT rating band
-- Update it to match player's current rating band
UPDATE team_players tp
SET rating_band_id = p.current_rating_band_id
FROM players p
WHERE tp.player_id = p.id;

-- Update the drafted snapshot trigger to populate both fields
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

-- Create trigger to keep team_players.rating_band_id in sync with player's current rating band
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

CREATE TRIGGER sync_team_player_rating_band_trigger
    AFTER UPDATE ON players
    FOR EACH ROW
    WHEN (OLD.current_rating_band_id IS DISTINCT FROM NEW.current_rating_band_id)
    EXECUTE FUNCTION sync_team_player_rating_band();

-- Update team validity function to use the correct columns
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

-- Update revalidate function too
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

-- Run the revalidation
SELECT revalidate_all_teams();