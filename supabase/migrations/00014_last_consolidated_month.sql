-- Controle do último mês consolidado para rodar consolidação automaticamente.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS last_consolidated_month TEXT;
