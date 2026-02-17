-- Add Credit Card columns to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 31);

-- Comment on columns
COMMENT ON COLUMN accounts.is_credit_card IS 'Identifies if the account is a credit card';
COMMENT ON COLUMN accounts.closing_day IS 'Day of the month when the invoice closes';
COMMENT ON COLUMN accounts.due_day IS 'Day of the month when the invoice is due';
