-- Migration: Add paid column to teams table
-- Created: 2025-07-21
-- Description: Add payment tracking for teams

ALTER TABLE teams 
ADD COLUMN paid BOOLEAN DEFAULT FALSE;

-- Update any existing teams to be unpaid by default
UPDATE teams SET paid = FALSE WHERE paid IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN teams.paid IS 'Payment status for the team - false means tentative/unpaid, true means paid';