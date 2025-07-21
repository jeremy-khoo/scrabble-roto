-- Reset tournament standings data for testing
-- This keeps all players and teams intact, just clears the standings

UPDATE players SET 
    tournament_wins = 0,
    tournament_losses = 0,
    tournament_spread = 0,
    tournament_games_played = 0,
    last_standings_update = NULL
WHERE event_id = 1; -- Adjust event_id as needed

-- Optional: View the reset data
-- SELECT name, tournament_wins, tournament_losses, tournament_spread 
-- FROM players 
-- WHERE event_id = 1 
-- ORDER BY name;