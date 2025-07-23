-- Fix the unique constraint to use drafted_rating_band_id instead of rating_band_id
-- The constraint should ensure one player per DRAFTED band per team, not current band

-- First, drop the existing constraint
ALTER TABLE team_players DROP CONSTRAINT team_players_team_id_rating_band_id_key;

-- Add the new constraint using drafted_rating_band_id
ALTER TABLE team_players ADD CONSTRAINT team_players_team_id_drafted_rating_band_id_key 
    UNIQUE (team_id, drafted_rating_band_id);

-- Now we can safely update rating_band_id to track current bands without constraint violations
UPDATE team_players tp
SET rating_band_id = p.current_rating_band_id
FROM players p
WHERE tp.player_id = p.id;