-- Opção no lançamento: "Eu paguei por ela" vs "Ela me pagou" (em vez de depender só da categoria)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS contact_payment_direction text;

COMMENT ON COLUMN transactions.contact_payment_direction IS 'Quando contact_id está preenchido: paid_by_me = eu paguei por ela, paid_to_me = ela me pagou. Null = usar regra da categoria (is_creditor_center).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_payment_direction') THEN
    ALTER TABLE transactions
    ADD CONSTRAINT chk_contact_payment_direction
    CHECK (contact_payment_direction IS NULL OR contact_payment_direction IN ('paid_by_me', 'paid_to_me'));
  END IF;
END $$;
