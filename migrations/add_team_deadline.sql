-- Migration: Add team creation/editing deadline enforcement
-- Deadline is 6 AM EST on tournament start date

-- Add computed deadline field to events table
ALTER TABLE events ADD COLUMN team_deadline TIMESTAMP WITH TIME ZONE 
    GENERATED ALWAYS AS (
        CASE 
            WHEN start_date IS NOT NULL THEN 
                (DATE(start_date) + TIME '06:00:00') AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC'
            ELSE NULL 
        END
    ) STORED;

-- Function to check if team operations are allowed for an event
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

-- Update team creation policy to enforce deadline
DROP POLICY IF EXISTS "Users can create their own teams" ON teams;
CREATE POLICY "Users can create their own teams" ON teams FOR INSERT WITH CHECK (
    auth.uid() = user_id AND is_team_operation_allowed(event_id)
);

-- Update team update policy to enforce deadline
DROP POLICY IF EXISTS "Users can update their own teams" ON teams;
CREATE POLICY "Users can update their own teams" ON teams FOR UPDATE USING (
    auth.uid() = user_id AND is_team_operation_allowed(event_id)
);

-- Also enforce deadline on team_players operations
DROP POLICY IF EXISTS "Users can manage their own team players" ON team_players;
CREATE POLICY "Users can manage their own team players" ON team_players FOR ALL USING (
    team_id IN (
        SELECT t.id FROM teams t 
        WHERE t.user_id = auth.uid() 
        AND is_team_operation_allowed(t.event_id)
    )
);

-- Add helpful view to check deadline status for events
CREATE OR REPLACE VIEW event_deadline_status AS
SELECT 
    e.id,
    e.name,
    e.start_date,
    e.team_deadline,
    e.is_active,
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