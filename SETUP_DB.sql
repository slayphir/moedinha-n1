-- =============================================================================
-- FINANCEIRO LAZY / MOEDA N1 - CONSOLIDATED DATABASE SETUP
-- Execute no Supabase SQL Editor (tudo referente a DB em um único arquivo).
-- Ordem: Extensions → Enums → Tabelas → Funções RLS → RLS → Storage → RPCs → Distribuição+Alertas
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE transaction_status AS ENUM ('pending', 'cleared', 'reconciled', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE member_role AS ENUM ('admin', 'financeiro', 'leitura'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE recurrence_freq AS ENUM ('weekly', 'monthly', 'yearly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE base_income_mode AS ENUM ('current_month', 'avg_3m', 'avg_6m', 'planned_manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE distribution_edit_mode AS ENUM ('auto', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE alert_severity AS ENUM ('info', 'warn', 'critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABELAS CORE
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'leitura',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',
  currency TEXT NOT NULL DEFAULT 'BRL',
  initial_balance DECIMAL(18,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  closing_day INT,
  due_day INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(org_id);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name, type)
);
CREATE INDEX IF NOT EXISTS idx_categories_org ON categories(org_id);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_org ON tags(org_id);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  status transaction_status NOT NULL DEFAULT 'cleared',
  amount DECIMAL(18,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  transfer_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  date DATE NOT NULL,
  due_date DATE,
  payment_date DATE,
  installment_id UUID,
  installment_number INT,
  total_installments INT,
  interest_amount DECIMAL(18,4) DEFAULT 0,
  fine_amount DECIMAL(18,4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT no_transfer_self CHECK (account_id != transfer_account_id OR transfer_account_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(org_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(org_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  frequency recurrence_freq NOT NULL,
  day_of_month INT CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  day_of_week INT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_org ON recurring_rules(org_id);

CREATE TABLE IF NOT EXISTS recurring_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  run_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_runs_rule ON recurring_runs(rule_id);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  alert_threshold DECIMAL(5,2) DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, category_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_org_month ON budgets(org_id, month);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_transaction ON attachments(transaction_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  origin TEXT NOT NULL DEFAULT 'UI',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_org ON api_tokens(org_id);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relationship TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scrooge_level INT DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_receivable BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id);

-- 4. FUNÇÕES RLS (schema public para evitar permissões no auth)
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role_in_org(org_uuid UUID)
RETURNS member_role AS $$
  SELECT role FROM org_members WHERE org_id = org_uuid AND user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_can_write_org(org_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org_uuid AND user_id = auth.uid() AND role IN ('admin', 'financeiro')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. RLS ENABLE
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES (DROP + CREATE para reexecução)
DROP POLICY IF EXISTS "orgs_select" ON orgs;
DROP POLICY IF EXISTS "orgs_insert" ON orgs;
DROP POLICY IF EXISTS "orgs_update" ON orgs;
CREATE POLICY "orgs_select" ON orgs FOR SELECT USING (id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "orgs_insert" ON orgs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "orgs_update" ON orgs FOR UPDATE USING (public.user_can_write_org(id));

DROP POLICY IF EXISTS "org_members_select" ON org_members;
DROP POLICY IF EXISTS "org_members_insert" ON org_members;
DROP POLICY IF EXISTS "org_members_update" ON org_members;
DROP POLICY IF EXISTS "org_members_delete" ON org_members;
CREATE POLICY "org_members_select" ON org_members FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "org_members_insert" ON org_members FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.user_can_write_org(org_id)
    OR (auth.uid() = user_id AND role = 'admin'::member_role AND NOT EXISTS (SELECT 1 FROM org_members em WHERE em.org_id = org_members.org_id))
  )
);
CREATE POLICY "org_members_update" ON org_members FOR UPDATE USING (public.get_user_role_in_org(org_id) = 'admin');
CREATE POLICY "org_members_delete" ON org_members FOR DELETE USING (public.get_user_role_in_org(org_id) = 'admin');

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_update" ON accounts;
DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (org_id IN (SELECT public.get_user_org_ids()) AND public.user_can_write_org(org_id));
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "tags_select" ON tags;
DROP POLICY IF EXISTS "tags_insert" ON tags;
DROP POLICY IF EXISTS "tags_update" ON tags;
DROP POLICY IF EXISTS "tags_delete" ON tags;
CREATE POLICY "tags_select" ON tags FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "tags_insert" ON tags FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "tags_update" ON tags FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "tags_delete" ON tags FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;
DROP POLICY IF EXISTS "transactions_delete" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (org_id IN (SELECT public.get_user_org_ids()) AND public.user_can_write_org(org_id));
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "transactions_delete" ON transactions FOR UPDATE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "transaction_tags_select" ON transaction_tags;
DROP POLICY IF EXISTS "transaction_tags_insert" ON transaction_tags;
DROP POLICY IF EXISTS "transaction_tags_delete" ON transaction_tags;
CREATE POLICY "transaction_tags_select" ON transaction_tags FOR SELECT USING (transaction_id IN (SELECT id FROM transactions WHERE org_id IN (SELECT public.get_user_org_ids())));
CREATE POLICY "transaction_tags_insert" ON transaction_tags FOR INSERT WITH CHECK (transaction_id IN (SELECT id FROM transactions t WHERE t.org_id IN (SELECT public.get_user_org_ids()) AND public.user_can_write_org(t.org_id)));
CREATE POLICY "transaction_tags_delete" ON transaction_tags FOR DELETE USING (transaction_id IN (SELECT id FROM transactions t WHERE public.user_can_write_org(t.org_id)));

DROP POLICY IF EXISTS "recurring_rules_select" ON recurring_rules;
DROP POLICY IF EXISTS "recurring_rules_insert" ON recurring_rules;
DROP POLICY IF EXISTS "recurring_rules_update" ON recurring_rules;
DROP POLICY IF EXISTS "recurring_rules_delete" ON recurring_rules;
CREATE POLICY "recurring_rules_select" ON recurring_rules FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "recurring_rules_insert" ON recurring_rules FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "recurring_rules_update" ON recurring_rules FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "recurring_rules_delete" ON recurring_rules FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "recurring_runs_select" ON recurring_runs;
DROP POLICY IF EXISTS "recurring_runs_insert" ON recurring_runs;
CREATE POLICY "recurring_runs_select" ON recurring_runs FOR SELECT USING (rule_id IN (SELECT id FROM recurring_rules WHERE org_id IN (SELECT public.get_user_org_ids())));
CREATE POLICY "recurring_runs_insert" ON recurring_runs FOR INSERT WITH CHECK (rule_id IN (SELECT id FROM recurring_rules r WHERE public.user_can_write_org(r.org_id)));

DROP POLICY IF EXISTS "budgets_select" ON budgets;
DROP POLICY IF EXISTS "budgets_insert" ON budgets;
DROP POLICY IF EXISTS "budgets_update" ON budgets;
DROP POLICY IF EXISTS "budgets_delete" ON budgets;
CREATE POLICY "budgets_select" ON budgets FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "budgets_insert" ON budgets FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "budgets_update" ON budgets FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "budgets_delete" ON budgets FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "attachments_select" ON attachments;
DROP POLICY IF EXISTS "attachments_insert" ON attachments;
DROP POLICY IF EXISTS "attachments_delete" ON attachments;
CREATE POLICY "attachments_select" ON attachments FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "attachments_insert" ON attachments FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "attachments_delete" ON attachments FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

DROP POLICY IF EXISTS "api_tokens_select" ON api_tokens;
DROP POLICY IF EXISTS "api_tokens_insert" ON api_tokens;
DROP POLICY IF EXISTS "api_tokens_update" ON api_tokens;
DROP POLICY IF EXISTS "api_tokens_delete" ON api_tokens;
CREATE POLICY "api_tokens_select" ON api_tokens FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()) AND public.get_user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_insert" ON api_tokens FOR INSERT WITH CHECK (public.get_user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_update" ON api_tokens FOR UPDATE USING (public.get_user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_delete" ON api_tokens FOR DELETE USING (public.get_user_role_in_org(org_id) = 'admin');

DROP POLICY IF EXISTS "contacts_select" ON contacts;
DROP POLICY IF EXISTS "contacts_insert" ON contacts;
DROP POLICY IF EXISTS "contacts_update" ON contacts;
DROP POLICY IF EXISTS "contacts_delete" ON contacts;
CREATE POLICY "contacts_select" ON contacts FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "contacts_insert" ON contacts FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "contacts_update" ON contacts FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "contacts_delete" ON contacts FOR DELETE USING (public.user_can_write_org(org_id));

-- 7. STORAGE BUCKET + POLICIES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attachments', 'attachments', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "attachments_read" ON storage.objects;
DROP POLICY IF EXISTS "attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "attachments_delete" ON storage.objects;
CREATE POLICY "attachments_read" ON storage.objects FOR SELECT USING (bucket_id = 'attachments' AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));
CREATE POLICY "attachments_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro')));
CREATE POLICY "attachments_delete" ON storage.objects FOR DELETE USING (bucket_id = 'attachments' AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro')));

-- 8. RPC: CRIAR ORGANIZAÇÃO (onboarding)
CREATE OR REPLACE FUNCTION public.create_new_organization(org_name TEXT, org_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_org_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM orgs WHERE slug = org_slug) THEN RAISE EXCEPTION 'Slug already exists'; END IF;
  INSERT INTO orgs (name, slug) VALUES (org_name, org_slug) RETURNING id INTO new_org_id;
  INSERT INTO org_members (org_id, user_id, role) VALUES (new_org_id, auth.uid(), 'admin');
  RETURN new_org_id;
END;
$$;

-- 9. RPC: CRIAR REGISTRO FINANCEIRO (parcelas, recorrência, padrão)
CREATE OR REPLACE FUNCTION public.create_financial_record(
  p_description TEXT, p_amount DECIMAL, p_type transaction_type, p_account_id UUID, p_category_id UUID,
  p_date DATE, p_due_date DATE, p_is_paid BOOLEAN, p_is_installment BOOLEAN, p_installments_count INT,
  p_is_recurring BOOLEAN, p_frequency recurrence_freq, p_interest_amount DECIMAL DEFAULT 0, p_fine_amount DECIMAL DEFAULT 0,
  p_contact_id UUID DEFAULT NULL, p_is_receivable BOOLEAN DEFAULT false, p_tags UUID[] DEFAULT '{}'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id UUID; v_transaction_id UUID; v_installment_group_id UUID; v_i INT; v_current_date DATE;
BEGIN
  SELECT org_id INTO v_org_id FROM accounts WHERE id = p_account_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Account not found or access denied'; END IF;
  IF p_is_recurring THEN
    INSERT INTO recurring_rules (org_id, description, amount, account_id, category_id, frequency, start_date, day_of_month)
    VALUES (v_org_id, p_description, p_amount, p_account_id, p_category_id, p_frequency, p_date, EXTRACT(DAY FROM p_date))
    RETURNING id INTO v_transaction_id;
    INSERT INTO transactions (org_id, description, amount, type, account_id, category_id, date, due_date, status, created_by)
    VALUES (v_org_id, p_description, p_amount, p_type, p_account_id, p_category_id, p_date, p_due_date, CASE WHEN p_is_paid THEN 'cleared'::transaction_status ELSE 'pending'::transaction_status END, auth.uid());
    RETURN v_transaction_id;
  END IF;
  IF p_is_installment AND p_installments_count > 1 THEN
    v_installment_group_id := uuid_generate_v4(); v_current_date := p_date;
    FOR v_i IN 1..p_installments_count LOOP
      INSERT INTO transactions (org_id, description, amount, type, account_id, category_id, date, due_date, status, installment_id, installment_number, total_installments, interest_amount, fine_amount, created_by)
      VALUES (v_org_id, p_description || ' (' || v_i || '/' || p_installments_count || ')', p_amount / p_installments_count, p_type, p_account_id, p_category_id, v_current_date, v_current_date,
        CASE WHEN v_i = 1 AND p_is_paid THEN 'cleared'::transaction_status ELSE 'pending'::transaction_status END, v_installment_group_id, v_i, p_installments_count, CASE WHEN v_i = 1 THEN p_interest_amount ELSE 0 END, 0, auth.uid())
      RETURNING id INTO v_transaction_id;
      v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;
    RETURN v_installment_group_id;
  END IF;
  INSERT INTO transactions (org_id, description, amount, type, account_id, category_id, date, due_date, status, interest_amount, fine_amount, contact_id, is_receivable, created_by)
  VALUES (v_org_id, p_description, p_amount, p_type, p_account_id, p_category_id, p_date, p_due_date, CASE WHEN p_is_paid THEN 'cleared'::transaction_status ELSE 'pending'::transaction_status END, p_interest_amount, p_fine_amount, p_contact_id, p_is_receivable, auth.uid())
  RETURNING id INTO v_transaction_id;
  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    INSERT INTO transaction_tags (transaction_id, tag_id) SELECT v_transaction_id, unnest(p_tags);
  END IF;
  RETURN v_transaction_id;
END;
$$;

-- 10. MÓDULO DISTRIBUIÇÃO + ALERTAS (Cofre Clássico) — basis points 100% = 10000
CREATE TABLE IF NOT EXISTS distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  mode distribution_edit_mode NOT NULL DEFAULT 'auto',
  base_income_mode base_income_mode NOT NULL DEFAULT 'current_month',
  planned_income DECIMAL(18,4),
  active_from DATE,
  active_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distributions_org ON distributions(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_distributions_org_default ON distributions(org_id) WHERE is_default = true;

-- Remover tabela antiga distribution_buckets (org_id) se existir; o modelo correto é distribution_id
DROP TABLE IF EXISTS distribution_buckets CASCADE;
CREATE TABLE distribution_buckets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distribution_id UUID NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  percent_bps INT NOT NULL CHECK (percent_bps >= 0 AND percent_bps <= 10000),
  color TEXT DEFAULT '#6366f1',
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_flexible BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_distribution_buckets_dist ON distribution_buckets(distribution_id);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_bucket_id UUID REFERENCES distribution_buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_default_bucket ON categories(default_bucket_id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bucket_id UUID REFERENCES distribution_buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_bucket ON transactions(org_id, bucket_id) WHERE deleted_at IS NULL;

DROP TABLE IF EXISTS month_snapshots CASCADE;
CREATE TABLE month_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  base_income DECIMAL(18,4) NOT NULL,
  base_income_mode base_income_mode NOT NULL,
  bucket_data JSONB NOT NULL DEFAULT '[]',
  day_ratio DECIMAL(10,4),
  total_spend DECIMAL(18,4),
  total_budget DECIMAL(18,4),
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, month)
);
CREATE INDEX idx_month_snapshots_org_month ON month_snapshots(org_id, month);

CREATE TABLE IF NOT EXISTS alert_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  severity alert_severity NOT NULL,
  condition_expression TEXT,
  cooldown_hours INT NOT NULL DEFAULT 24,
  hysteresis_pct DECIMAL(5,2) DEFAULT 5,
  message_template TEXT NOT NULL,
  cta_primary TEXT,
  cta_secondary TEXT,
  channels TEXT[] DEFAULT ARRAY['in_app']
);
CREATE INDEX IF NOT EXISTS idx_alert_definitions_code ON alert_definitions(code);

DROP TABLE IF EXISTS alerts CASCADE;
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  month DATE NOT NULL,
  alert_code TEXT NOT NULL,
  severity alert_severity NOT NULL,
  message TEXT NOT NULL,
  context_json JSONB DEFAULT '{}',
  cta_primary TEXT,
  cta_secondary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ
);
CREATE INDEX idx_alerts_org_month ON alerts(org_id, month);
CREATE INDEX idx_alerts_org_created ON alerts(org_id, created_at DESC);

ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "distributions_select" ON distributions;
DROP POLICY IF EXISTS "distributions_insert" ON distributions;
DROP POLICY IF EXISTS "distributions_update" ON distributions;
DROP POLICY IF EXISTS "distributions_delete" ON distributions;
CREATE POLICY "distributions_select" ON distributions FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "distributions_insert" ON distributions FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "distributions_update" ON distributions FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "distributions_delete" ON distributions FOR DELETE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "distribution_buckets_select" ON distribution_buckets;
DROP POLICY IF EXISTS "distribution_buckets_insert" ON distribution_buckets;
DROP POLICY IF EXISTS "distribution_buckets_update" ON distribution_buckets;
DROP POLICY IF EXISTS "distribution_buckets_delete" ON distribution_buckets;
CREATE POLICY "distribution_buckets_select" ON distribution_buckets FOR SELECT USING (distribution_id IN (SELECT id FROM distributions WHERE org_id IN (SELECT public.get_user_org_ids())));
CREATE POLICY "distribution_buckets_insert" ON distribution_buckets FOR INSERT WITH CHECK (distribution_id IN (SELECT id FROM distributions d WHERE public.user_can_write_org(d.org_id)));
CREATE POLICY "distribution_buckets_update" ON distribution_buckets FOR UPDATE USING (distribution_id IN (SELECT id FROM distributions d WHERE public.user_can_write_org(d.org_id)));
CREATE POLICY "distribution_buckets_delete" ON distribution_buckets FOR DELETE USING (distribution_id IN (SELECT id FROM distributions d WHERE public.user_can_write_org(d.org_id)));

DROP POLICY IF EXISTS "month_snapshots_select" ON month_snapshots;
DROP POLICY IF EXISTS "month_snapshots_insert" ON month_snapshots;
DROP POLICY IF EXISTS "month_snapshots_update" ON month_snapshots;
CREATE POLICY "month_snapshots_select" ON month_snapshots FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "month_snapshots_insert" ON month_snapshots FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "month_snapshots_update" ON month_snapshots FOR UPDATE USING (public.user_can_write_org(org_id));

DROP POLICY IF EXISTS "alert_definitions_select" ON alert_definitions;
CREATE POLICY "alert_definitions_select" ON alert_definitions FOR SELECT USING (true);

DROP POLICY IF EXISTS "alerts_select" ON alerts;
DROP POLICY IF EXISTS "alerts_insert" ON alerts;
DROP POLICY IF EXISTS "alerts_update" ON alerts;
CREATE POLICY "alerts_select" ON alerts FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "alerts_insert" ON alerts FOR INSERT WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "alerts_update" ON alerts FOR UPDATE USING (org_id IN (SELECT public.get_user_org_ids()));

INSERT INTO alert_definitions (code, name, severity, message_template, cta_primary, cta_secondary, cooldown_hours) VALUES
  ('bucket_70', 'Bucket 70%', 'warn', '{bucket} atingiu 70% do orçamento.', 'Ajustar orçamento', 'Reclassificar', 24),
  ('bucket_90', 'Bucket 90%', 'warn', '{bucket} atingiu 90% do orçamento.', 'Ajustar orçamento', NULL, 24),
  ('bucket_over', 'Bucket estouro', 'critical', '{bucket} estourou o orçamento.', 'Ajustar distribuição', NULL, 12),
  ('pace_15', 'Ritmo 15% acima', 'warn', 'Gasto em {bucket} está 15% acima do ritmo ideal.', 'Ver transações', NULL, 24),
  ('pace_30', 'Ritmo 30% acima', 'critical', 'Gasto em {bucket} está 30% acima do ritmo ideal.', 'Ajustar orçamento', NULL, 24),
  ('projection', 'Projeção de fechamento', 'warn', 'Se continuar assim, {bucket} fecha em {projection_pct}%.', 'Ajustar gastos', NULL, 24),
  ('concentration_bucket', 'Concentração em um bucket', 'warn', 'Um bucket representa mais de 60% dos gastos.', 'Ver distribuição', NULL, 24),
  ('concentration_top5', 'Top 5 transações', 'warn', 'Poucas transações concentram mais da metade do gasto em {bucket}.', 'Ver transações', NULL, 24),
  ('pending_pct', 'Pendências por %', 'warn', 'Mais de 10% das despesas sem bucket.', 'Reclassificar pendentes', NULL, 24),
  ('pending_count', 'Pendências por quantidade', 'warn', '20+ transações sem categoria/bucket neste mês.', 'Reclassificar pendentes', NULL, 24)
ON CONFLICT (code) DO NOTHING;

-- 11. METAS, INSIGHTS & PLANOS (Phase 4)

CREATE TYPE goal_type AS ENUM ('savings', 'emergency_fund', 'debt', 'reduction', 'purchase');
CREATE TYPE goal_status AS ENUM ('active', 'completed', 'paused', 'cancelled');
CREATE TYPE goal_funding_strategy AS ENUM ('bucket_fraction', 'month_leftover', 'fixed_amount', 'manual');

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type goal_type NOT NULL,
  
  target_amount DECIMAL(18,4), -- Valor alvo (R$)
  target_date DATE, -- Prazo
  
  current_amount DECIMAL(18,4) DEFAULT 0, -- Progresso atual
  
  -- Para metas de redu��o:
  reduction_category_id UUID REFERENCES categories(id),
  reduction_target_pct DECIMAL(5,2), -- % de redu��o
  baseline_amount DECIMAL(18,4), -- Base de compara��o
  
  strategy goal_funding_strategy DEFAULT 'manual',
  linked_bucket_id UUID REFERENCES distribution_buckets(id),
  
  status goal_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_org ON goals(org_id);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_select" ON goals FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "goals_insert" ON goals FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "goals_update" ON goals FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "goals_delete" ON goals FOR DELETE USING (public.user_can_write_org(org_id));

-- Planos de Redu��o
CREATE TABLE IF NOT EXISTS reduction_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  target_category_id UUID REFERENCES categories(id),
  target_bucket_id UUID REFERENCES distribution_buckets(id),
  
  original_amount DECIMAL(18,4),
  planned_amount DECIMAL(18,4),
  
  suggestions JSONB DEFAULT '[]', -- T�ticas de redu��o
  
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE reduction_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reduction_plans_select" ON reduction_plans FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "reduction_plans_insert" ON reduction_plans FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "reduction_plans_update" ON reduction_plans FOR UPDATE USING (public.user_can_write_org(org_id));

