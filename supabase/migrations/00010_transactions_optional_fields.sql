-- Add optional fields used by transaction form and reports.
-- Safe to run multiple times.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS installment_id UUID;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS contact_id UUID;

DO $$
BEGIN
  IF to_regclass('public.contacts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'transactions_contact_id_fkey'
     ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_due_date
  ON transactions(org_id, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_id
  ON transactions(org_id, installment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_contact_id
  ON transactions(org_id, contact_id)
  WHERE deleted_at IS NULL;
