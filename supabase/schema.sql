-- Schema inicial para Supabase (PostgreSQL).
-- Opcional: o app cria as tabelas automaticamente na primeira requisição (init_db).
-- Use este arquivo se quiser criar manualmente no SQL Editor do Supabase.

-- Tipos ENUM (PostgreSQL)
DO $$ BEGIN
  CREATE TYPE transactiontype AS ENUM ('income', 'expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE analysistype AS ENUM ('daily', 'weekly', 'monthly', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tabelas (ordem por dependência)
CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  last_digits VARCHAR(4),
  color VARCHAR(7) DEFAULT '#6366f1',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type transactiontype NOT NULL,
  budget_limit FLOAT,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount FLOAT NOT NULL,
  type transactiontype NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  payment_method_id INTEGER REFERENCES payment_methods(id),
  is_paid INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hash VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS ix_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS ix_transactions_hash ON transactions(hash);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  type analysistype NOT NULL,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  content TEXT NOT NULL,
  recommendations TEXT,
  insights TEXT,
  alerts TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ai_analyses_date ON ai_analyses(date);

CREATE TABLE IF NOT EXISTS import_history (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(10) NOT NULL,
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_duplicated INTEGER DEFAULT 0,
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id SERIAL PRIMARY KEY,
  description VARCHAR(500) NOT NULL,
  amount FLOAT NOT NULL,
  type transactiontype NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  frequency VARCHAR(20) NOT NULL,
  day_of_month INTEGER,
  day_of_week INTEGER,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  last_generated TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installment_plans (
  id SERIAL PRIMARY KEY,
  description VARCHAR(500) NOT NULL,
  total_amount FLOAT NOT NULL,
  installment_amount FLOAT NOT NULL,
  total_installments INTEGER NOT NULL,
  paid_installments INTEGER DEFAULT 0,
  category_id INTEGER REFERENCES categories(id),
  start_date TIMESTAMP NOT NULL,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
