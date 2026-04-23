-- Quando a categoria está marcada e o lançamento tem contato = "esta pessoa me paga" (receita, soma).
-- Categoria sem marca + contato = "eu pago esta pessoa" (despesa, subtrai).
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_creditor_center BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN categories.is_creditor_center IS 'Se true, lançamentos com contato nesta categoria = esta pessoa me paga (receita). Caso contrário contato = eu pago (despesa).';
