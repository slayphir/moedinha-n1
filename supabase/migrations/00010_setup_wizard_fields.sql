-- Add setup_completed to orgs
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false;
