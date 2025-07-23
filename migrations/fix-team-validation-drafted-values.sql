-- Fix team validation to check against drafted values instead of original values
-- Teams should be invalid if players changed from when they were DRAFTED, not from their original event state

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
           OR p.current_rating_band_id != tp.rating_band_id  -- tp.rating_band_id is the band they were drafted in
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
             OR p.current_rating_band_id != tp.rating_band_id
      );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also update the revalidate_all_teams function to use drafted values
CREATE OR REPLACE FUNCTION revalidate_all_teams()
RETURNS void AS $$
BEGIN
    -- First, mark all teams as valid
    UPDATE teams SET is_valid = true;
    
    -- Then mark invalid teams based on current rules (using drafted values)
    UPDATE teams
    SET is_valid = false
    WHERE id IN (
        SELECT DISTINCT tp.team_id
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE p.dropped_out = true
           OR p.current_division != tp.drafted_division
           OR p.current_rating_band_id != tp.rating_band_id
    );
END;
$$ LANGUAGE plpgsql;

-- Run the revalidation to fix teams using the corrected logic
SELECT revalidate_all_teams();