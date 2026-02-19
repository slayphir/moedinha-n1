-- Define a data inicial de saldo para evitar contabilizar retroativos no card.
-- Quando preenchida, o card de saldo considera apenas movimentacoes a partir desta data.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS balance_start_date DATE;
