-- Add liquidity_type to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS liquidity_type TEXT DEFAULT 'immediate'; -- immediate, d+1, d+30, locked

-- Ensure goals table exists (if not created in previous migrations) and has necessary columns
-- Based on goals.ts, it seems to be used. If it doesn't exist in previous migrations, we create it here.
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

-- Index for goals
CREATE INDEX IF NOT EXISTS idx_goals_org ON goals(org_id);
