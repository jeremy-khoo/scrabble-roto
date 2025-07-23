-- Debug version of the revalidation function that shows WHY teams are invalid
CREATE OR REPLACE FUNCTION debug_revalidate_all_teams()
RETURNS TABLE(
    team_id INTEGER,
    team_name VARCHAR(100),  -- Match the actual column type
    player_name VARCHAR(100), -- Match the actual column type
    reason TEXT,
    details TEXT
) AS $$
BEGIN
    -- First, mark all teams as valid
    UPDATE teams SET is_valid = true;
    
    -- Find all invalid teams and return details about WHY they're invalid
    RETURN QUERY
    SELECT DISTINCT 
        t.id as team_id,
        t.name as team_name,
        p.name as player_name,
        CASE 
            WHEN p.dropped_out = true THEN 'Player dropped out'
            WHEN p.original_division != p.current_division THEN 'Division changed'
            WHEN p.original_rating_band_id != p.current_rating_band_id THEN 'Rating band changed'
            ELSE 'Unknown reason'
        END::TEXT as reason,
        CONCAT(
            'Original: Division ', p.original_division, 
            ', Rating ', p.original_rating,
            ', Band ID ', p.original_rating_band_id,
            ' | Current: Division ', p.current_division,
            ', Rating ', p.current_rating,
            ', Band ID ', p.current_rating_band_id,
            ' | Dropped out: ', p.dropped_out
        )::TEXT as details
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    JOIN teams t ON tp.team_id = t.id
    WHERE p.dropped_out = true
       OR p.original_division != p.current_division
       OR p.original_rating_band_id != p.current_rating_band_id
    ORDER BY t.id, p.name;
    
    -- Now mark the invalid teams
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

-- Also create a function to check for NULL rating band IDs
CREATE OR REPLACE FUNCTION check_null_rating_bands()
RETURNS TABLE(
    player_id INTEGER,
    player_name VARCHAR(100),
    event_id INTEGER,
    current_rating INTEGER,
    current_division INTEGER,
    original_rating_band_id INTEGER,
    current_rating_band_id INTEGER,
    expected_band_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.event_id,
        p.current_rating,
        p.current_division,
        p.original_rating_band_id,
        p.current_rating_band_id,
        get_rating_band(p.current_rating, p.current_division, p.event_id) as expected_band_id
    FROM players p
    WHERE p.original_rating_band_id IS NULL 
       OR p.current_rating_band_id IS NULL
       OR p.original_rating_band_id != get_rating_band(p.original_rating, p.original_division, p.event_id)
       OR p.current_rating_band_id != get_rating_band(p.current_rating, p.current_division, p.event_id)
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

-- Run the debug validation
SELECT * FROM debug_revalidate_all_teams();

-- Check for NULL or incorrect rating bands
SELECT * FROM check_null_rating_bands();