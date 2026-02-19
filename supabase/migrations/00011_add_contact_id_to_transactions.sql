-- Add contact_id to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id);
