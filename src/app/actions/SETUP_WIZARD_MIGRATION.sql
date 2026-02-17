-- Add setup_completed flag to orgs table
-- Run this migration in your Supabase SQL editor

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS setup_completed boolean DEFAULT false;

-- Set existing orgs as already completed (they don't need the wizard)
UPDATE orgs SET setup_completed = true WHERE setup_completed IS NULL OR setup_completed = false;
