-- Add monthly_budget column to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(12,2) DEFAULT NULL;

COMMENT ON COLUMN categories.monthly_budget IS 'Target monthly spending limit for this category';
