-- Campos para gestão de cartão de crédito e vencimento/fatura
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN DEFAULT false;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(18,4) DEFAULT 0;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS closing_day INT
    CHECK (closing_day IS NULL OR (closing_day >= 1 AND closing_day <= 31));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS due_day INT
    CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31));

CREATE INDEX IF NOT EXISTS idx_accounts_credit_card ON accounts(org_id, is_credit_card);

-- Sincroniza flag para contas já tipadas como cartão
UPDATE accounts
SET is_credit_card = true
WHERE type = 'credit_card' AND (is_credit_card IS DISTINCT FROM true);
