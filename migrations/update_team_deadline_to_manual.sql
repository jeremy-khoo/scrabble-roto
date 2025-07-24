-- Migration: Convert team_deadline from computed to manual column
-- This allows admins to set custom deadlines instead of automatic 6 AM EST on start date

-- First, drop the view that depends on the column
DROP VIEW IF EXISTS event_deadline_status;

-- Drop the existing computed column
ALTER TABLE events DROP COLUMN IF EXISTS team_deadline;

-- Add a new manual team_deadline column
ALTER TABLE events ADD COLUMN team_deadline TIMESTAMP WITH TIME ZONE;

-- Update the is_team_operation_allowed function to work with manual deadlines
CREATE OR REPLACE FUNCTION is_team_operation_allowed(event_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    deadline TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Admins can always perform team operations
    IF is_admin_user(auth.uid()) THEN
        RETURN TRUE;
    END IF;
    
    SELECT team_deadline INTO deadline
    FROM events 
    WHERE id = event_id;
    
    -- If no deadline set, allow operations
    IF deadline IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check if current time is before deadline
    RETURN NOW() < deadline;
END;
$$ LANGUAGE plpgsql;

-- Update the event_deadline_status view to work with manual deadlines
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

-- Optionally migrate existing events to have deadlines based on their start dates
-- (6 AM EST on tournament start date, as was the previous automatic behavior)
-- Uncomment if you want to preserve existing deadline behavior for current events
/*
UPDATE events 
SET team_deadline = (DATE(start_date) + TIME '06:00:00') AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC'
WHERE start_date IS NOT NULL AND team_deadline IS NULL;
*/