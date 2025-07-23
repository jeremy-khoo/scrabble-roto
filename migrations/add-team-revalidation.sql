-- Update team validity function to also mark teams as valid again when appropriate
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

    -- Mark teams valid again if ALL their players are now valid:
    -- 1. Not dropped out, AND
    -- 2. Back in their original division, AND
    -- 3. Back in their original rating band
    UPDATE teams
    SET is_valid = true
    WHERE is_valid = false  -- Only check currently invalid teams
      AND id NOT IN (
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