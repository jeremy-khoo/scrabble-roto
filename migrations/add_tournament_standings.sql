-- Add tournament standings columns to players table
-- These will be updated by the standings sync worker

ALTER TABLE players 
ADD COLUMN tournament_wins DECIMAL(4,1) DEFAULT 0,
ADD COLUMN tournament_losses DECIMAL(4,1) DEFAULT 0, 
ADD COLUMN tournament_spread INTEGER DEFAULT 0,
ADD COLUMN tournament_games_played INTEGER DEFAULT 0,
ADD COLUMN last_standings_update TIMESTAMPTZ;

-- Index for faster team aggregation queries
CREATE INDEX idx_players_tournament_stats ON players(event_id, tournament_wins, tournament_spread);

-- Create a view for team standings that calculates totals on-the-fly
CREATE OR REPLACE VIEW team_standings AS
SELECT 
    t.id,
    t.name,
    t.user_id,
    t.event_id,
    t.is_valid,
    t.paid,
    t.created_at,
    e.name as event_name,
    COALESCE(SUM(p.tournament_wins), 0) as total_wins,
    COALESCE(SUM(p.tournament_losses), 0) as total_losses,
    COALESCE(SUM(p.tournament_spread), 0) as total_spread,
    COALESCE(SUM(p.tournament_games_played), 0) as total_games,
    COUNT(tp.player_id) as player_count,
    MIN(p.last_standings_update) as oldest_update,
    MAX(p.last_standings_update) as newest_update
FROM teams t
LEFT JOIN team_players tp ON t.id = tp.team_id
LEFT JOIN players p ON tp.player_id = p.id
LEFT JOIN events e ON t.event_id = e.id
GROUP BY t.id, t.name, t.user_id, t.event_id, t.is_valid, t.paid, t.created_at, e.name
ORDER BY total_wins DESC, total_spread DESC;

-- Grant access to the view
GRANT SELECT ON team_standings TO authenticated;
GRANT SELECT ON team_standings TO anon;