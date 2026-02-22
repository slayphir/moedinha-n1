-- Fontes de renda + pre-lancamentos mensais de recebimento.

CREATE TYPE income_run_status AS ENUM ('pending', 'received', 'skipped', 'cancelled');

CREATE TABLE IF NOT EXISTS income_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planned_amount DECIMAL(18,4) NOT NULL CHECK (planned_amount >= 0),
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_income_sources_org ON income_sources(org_id, is_active);

CREATE TABLE IF NOT EXISTS income_source_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  expected_date DATE NOT NULL,
  planned_amount DECIMAL(18,4) NOT NULL CHECK (planned_amount >= 0),
  actual_amount DECIMAL(18,4),
  status income_run_status NOT NULL DEFAULT 'pending',
  received_at TIMESTAMPTZ,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT income_source_runs_month_first_day CHECK (month = date_trunc('month', month)::date),
  UNIQUE(source_id, month)
);
CREATE INDEX IF NOT EXISTS idx_income_source_runs_org_month ON income_source_runs(org_id, month, status);
CREATE INDEX IF NOT EXISTS idx_income_source_runs_source ON income_source_runs(source_id);

ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_source_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "income_sources_select" ON income_sources FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "income_sources_insert" ON income_sources FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "income_sources_update" ON income_sources FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "income_sources_delete" ON income_sources FOR DELETE
  USING (public.can_write_org(org_id));

CREATE POLICY "income_source_runs_select" ON income_source_runs FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "income_source_runs_insert" ON income_source_runs FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "income_source_runs_update" ON income_source_runs FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "income_source_runs_delete" ON income_source_runs FOR DELETE
  USING (public.can_write_org(org_id));
