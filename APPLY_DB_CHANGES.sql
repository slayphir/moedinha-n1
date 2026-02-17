-- ==========================================
-- 1. Credit Card Management (Accounts Table)
-- ==========================================
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 31);

COMMENT ON COLUMN accounts.is_credit_card IS 'Identifies if the account is a credit card';
COMMENT ON COLUMN accounts.closing_day IS 'Day of the month when the invoice closes';
COMMENT ON COLUMN accounts.due_day IS 'Day of the month when the invoice is due';


-- ==========================================
-- 2. Emergency Reserve & Goals
-- ==========================================
-- Add liquidity_type to accounts
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS liquidity_type TEXT DEFAULT 'immediate'; -- immediate, d+1, d+30, locked

-- Ensure goals table exists
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'savings', -- savings, emergency_fund, debt, reduction, purchase
    target_amount DECIMAL(18,4),
    target_date DATE,
    current_amount DECIMAL(18,4) DEFAULT 0,
    strategy TEXT DEFAULT 'manual', -- bucket_fraction, month_leftover, fixed_amount, manual
    
    -- Fields for specific strategies or types
    reduction_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    reduction_target_pct DECIMAL(5,2),
    baseline_amount DECIMAL(18,4),
    linked_bucket_id UUID, -- If we link to a distribution bucket
    
    status TEXT DEFAULT 'active', -- active, completed, paused, cancelled
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_org ON goals(org_id);


-- ==========================================
-- 3. Category Budgets
-- ==========================================
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(12,2) DEFAULT NULL;

COMMENT ON COLUMN categories.monthly_budget IS 'Target monthly spending limit for this category';


-- ==========================================
-- 4. Telegram Alerts
-- ==========================================
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
