-- Remove unused is_valid and invalid_reason columns from players table
-- These fields were added but never used - validity is properly tracked at the team level

-- Drop triggers that use these fields
DROP TRIGGER IF EXISTS check_player_validity_trigger ON players;
DROP TRIGGER IF EXISTS update_player_validity_trigger ON players;

-- Drop functions that use these fields
DROP FUNCTION IF EXISTS check_player_validity();
DROP FUNCTION IF EXISTS update_player_validity();

-- Drop the unused columns
ALTER TABLE players 
DROP COLUMN IF EXISTS is_valid,
DROP COLUMN IF EXISTS invalid_reason;

-- Note: Team validation remains intact and works correctly by comparing:
-- - team_players.rating_band_id (when player was drafted)
-- - players.current_rating_band_id (player's current band)
-- Teams are marked invalid when these don't match or when players drop out