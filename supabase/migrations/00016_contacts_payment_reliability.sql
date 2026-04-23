-- Nível de confiabilidade no pagamento: paga em dia, atrasa, deixou de pagar, etc.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS payment_reliability TEXT;

COMMENT ON COLUMN contacts.payment_reliability IS 'on_time | sometimes_late | often_late | stopped_paying | unknown. Usado para mensurar se a pessoa paga em dia ou não.';
