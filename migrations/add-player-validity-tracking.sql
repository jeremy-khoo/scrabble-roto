-- Add columns to track player validity issues
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS invalid_reason TEXT;

-- Function to update player validity status
CREATE OR REPLACE FUNCTION update_player_validity()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if player should be marked invalid
    IF NEW.dropped_out = true THEN
        NEW.is_valid := false;
        NEW.invalid_reason := 'Player dropped out';
    ELSIF NEW.original_division != NEW.current_division THEN
        NEW.is_valid := false;
        NEW.invalid_reason := 'Division changed from ' || NEW.original_division || ' to ' || NEW.current_division;
    ELSIF NEW.original_rating_band_id != NEW.current_rating_band_id THEN
        NEW.is_valid := false;
        NEW.invalid_reason := 'Rating band changed from ' || NEW.original_rating_band_id || ' to ' || NEW.current_rating_band_id;
    ELSIF NEW.original_rating_band_id IS NULL OR NEW.current_rating_band_id IS NULL THEN
        NEW.is_valid := false;
        NEW.invalid_reason := 'Missing rating band assignment';
    ELSE
        NEW.is_valid := true;
        NEW.invalid_reason := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update player validity
CREATE TRIGGER update_player_validity_trigger
    BEFORE INSERT OR UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_player_validity();

-- Update all existing players' validity status
UPDATE players p
SET is_valid = CASE 
    WHEN dropped_out = true THEN false
    WHEN original_division != current_division THEN false
    WHEN original_rating_band_id != current_rating_band_id THEN false
    WHEN original_rating_band_id IS NULL OR current_rating_band_id IS NULL THEN false
    ELSE true
END,
invalid_reason = CASE 
    WHEN dropped_out = true THEN 'Player dropped out'
    WHEN original_division != current_division THEN 'Division changed from ' || original_division || ' to ' || current_division
    WHEN original_rating_band_id != current_rating_band_id THEN 'Rating band changed from ' || original_rating_band_id || ' to ' || current_rating_band_id
    WHEN original_rating_band_id IS NULL OR current_rating_band_id IS NULL THEN 'Missing rating band assignment'
    ELSE NULL
END;

-- Show all invalid players
SELECT id, name, is_valid, invalid_reason, 
       original_rating, current_rating, 
       original_division, current_division,
       original_rating_band_id, current_rating_band_id
FROM players 
WHERE is_valid = false
ORDER BY name;