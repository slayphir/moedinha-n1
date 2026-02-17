-- Add telegram_config column to orgs table
ALTER TABLE orgs 
ADD COLUMN IF NOT EXISTS telegram_config JSONB DEFAULT NULL;

-- Example structure of telegram_config:
-- {
--   "chat_id": "123456",
--   "is_active": true,
--   "preferences": {
--     "daily_summary": true,
--     "bill_reminder": true
--   }
-- }
