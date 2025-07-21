-- Fix missing is_active and created_at columns in event_deadline_status view
DROP VIEW IF EXISTS event_deadline_status;
CREATE OR REPLACE VIEW event_deadline_status AS
SELECT 
    e.id,
    e.name,
    e.start_date,
    e.team_deadline,
    e.is_active,
    e.created_at,
    (NOW() < e.team_deadline OR e.team_deadline IS NULL) AS teams_allowed,
    CASE 
        WHEN e.team_deadline IS NULL THEN 'No deadline set'
        WHEN NOW() < e.team_deadline THEN 'Open for team operations'
        ELSE 'Team operations closed'
    END AS status,
    CASE 
        WHEN e.team_deadline IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (e.team_deadline - NOW())) / 3600
        ELSE NULL 
    END AS hours_until_deadline
FROM events e;

-- Grant access to the view
GRANT SELECT ON event_deadline_status TO authenticated;