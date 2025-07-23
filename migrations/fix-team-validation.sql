-- Fix team validation to only invalidate when players change rating bands, divisions, or drop out
-- Not just any rating change within the same band

CREATE OR REPLACE FUNCTION update_team_validity()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark teams invalid if they contain players who:
    -- 1. Dropped out, OR
    -- 2. Changed division, OR  
    -- 3. Changed to a different rating band than when they were drafted
    UPDATE teams
    SET is_valid = false
    WHERE id IN (
        SELECT DISTINCT tp.team_id
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE p.dropped_out = true
           OR p.original_division != p.current_division
           OR p.original_rating_band_id != p.current_rating_band_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also create a function to revalidate all teams (useful after fixing the logic)
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
           OR p.original_division != p.current_division
           OR p.original_rating_band_id != p.current_rating_band_id
    );
END;
$$ LANGUAGE plpgsql;

-- Run the revalidation to fix teams that were incorrectly marked invalid
SELECT revalidate_all_teams();