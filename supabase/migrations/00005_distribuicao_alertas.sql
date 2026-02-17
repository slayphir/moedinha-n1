-- MÃ³dulo DistribuiÃ§Ã£o + Alertas (Cofre ClÃ¡ssico)
-- Basis points: 100% = 10000

CREATE TYPE base_income_mode AS ENUM ('current_month', 'avg_3m', 'avg_6m', 'planned_manual');
CREATE TYPE distribution_edit_mode AS ENUM ('auto', 'manual');
CREATE TYPE alert_severity AS ENUM ('info', 'warn', 'critical');

-- Distributions (template por org)
CREATE TABLE distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  mode distribution_edit_mode NOT NULL DEFAULT 'auto',
  base_income_mode base_income_mode NOT NULL DEFAULT 'current_month',
  planned_income DECIMAL(18,4), -- usado quando base_income_mode = planned_manual
  active_from DATE,
  active_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_distributions_org ON distributions(org_id);
CREATE UNIQUE INDEX idx_distributions_org_default ON distributions(org_id) WHERE is_default = true;

-- Buckets de uma distribution (2 a 8, soma percent_bps = 10000)
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

-- Categories: default bucket (mapeamento categoria -> bucket)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_bucket_id UUID REFERENCES distribution_buckets(id) ON DELETE SET NULL;
CREATE INDEX idx_categories_default_bucket ON categories(default_bucket_id);

-- Transactions: bucket (pode ser inferido por category.default_bucket_id ou override)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bucket_id UUID REFERENCES distribution_buckets(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_bucket ON transactions(org_id, bucket_id) WHERE deleted_at IS NULL;

-- Month snapshots (prÃ©-agregaÃ§Ã£o por org/mÃªs)
CREATE TABLE month_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  base_income DECIMAL(18,4) NOT NULL,
  base_income_mode base_income_mode NOT NULL,
  bucket_data JSONB NOT NULL DEFAULT '[]', -- [{ bucket_id, budget, spend, spend_pct, pace_ideal, projection }]
  day_ratio DECIMAL(10,4),
  total_spend DECIMAL(18,4),
  total_budget DECIMAL(18,4),
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, month)
);
CREATE INDEX idx_month_snapshots_org_month ON month_snapshots(org_id, month);

-- Alert definitions (catÃ¡logo estÃ¡tico; seed)
CREATE TABLE alert_definitions (
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
CREATE INDEX idx_alert_definitions_code ON alert_definitions(code);

-- Alerts (instÃ¢ncias emitidas)
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

-- RLS
ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "distributions_select" ON distributions FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "distributions_insert" ON distributions FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "distributions_update" ON distributions FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "distributions_delete" ON distributions FOR DELETE
  USING (public.can_write_org(org_id));

CREATE POLICY "distribution_buckets_select" ON distribution_buckets FOR SELECT
  USING (distribution_id IN (SELECT id FROM distributions WHERE org_id IN (SELECT public.user_org_ids())));
CREATE POLICY "distribution_buckets_insert" ON distribution_buckets FOR INSERT
  WITH CHECK (distribution_id IN (SELECT id FROM distributions d WHERE public.can_write_org(d.org_id)));
CREATE POLICY "distribution_buckets_update" ON distribution_buckets FOR UPDATE
  USING (distribution_id IN (SELECT id FROM distributions d WHERE public.can_write_org(d.org_id)));
CREATE POLICY "distribution_buckets_delete" ON distribution_buckets FOR DELETE
  USING (distribution_id IN (SELECT id FROM distributions d WHERE public.can_write_org(d.org_id)));

CREATE POLICY "month_snapshots_select" ON month_snapshots FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "month_snapshots_insert" ON month_snapshots FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "month_snapshots_update" ON month_snapshots FOR UPDATE
  USING (public.can_write_org(org_id));

CREATE POLICY "alert_definitions_select" ON alert_definitions FOR SELECT
  USING (true);

CREATE POLICY "alerts_select" ON alerts FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "alerts_insert" ON alerts FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "alerts_update" ON alerts FOR UPDATE
  USING (org_id IN (SELECT public.user_org_ids()));

-- Seed alert_definitions (base)
INSERT INTO alert_definitions (code, name, severity, message_template, cta_primary, cta_secondary, cooldown_hours) VALUES
  ('bucket_70', 'Bucket 70%', 'warn', '{bucket} atingiu 70% do orÃ§amento.', 'Ajustar orÃ§amento', 'Reclassificar', 24),
  ('bucket_90', 'Bucket 90%', 'warn', '{bucket} atingiu 90% do orÃ§amento.', 'Ajustar orÃ§amento', NULL, 24),
  ('bucket_over', 'Bucket estouro', 'critical', '{bucket} estourou o orÃ§amento.', 'Ajustar distribuiÃ§Ã£o', NULL, 12),
  ('pace_15', 'Ritmo 15% acima', 'warn', 'Gasto em {bucket} estÃ¡ 15% acima do ritmo ideal.', 'Ver transaÃ§Ãµes', NULL, 24),
  ('pace_30', 'Ritmo 30% acima', 'critical', 'Gasto em {bucket} estÃ¡ 30% acima do ritmo ideal.', 'Ajustar orÃ§amento', NULL, 24),
  ('projection', 'ProjeÃ§Ã£o de fechamento', 'warn', 'Se continuar assim, {bucket} fecha em {projection_pct}%.', 'Ajustar gastos', NULL, 24),
  ('concentration_bucket', 'ConcentraÃ§Ã£o em um bucket', 'warn', 'Um bucket representa mais de 60% dos gastos.', 'Ver distribuiÃ§Ã£o', NULL, 24),
  ('concentration_top5', 'Top 5 transaÃ§Ãµes', 'warn', 'Poucas transaÃ§Ãµes concentram mais da metade do gasto em {bucket}.', 'Ver transaÃ§Ãµes', NULL, 24),
  ('pending_pct', 'PendÃªncias por %', 'warn', 'Mais de 10% das despesas sem bucket.', 'Reclassificar pendentes', NULL, 24),
  ('pending_count', 'PendÃªncias por quantidade', 'warn', '20+ transaÃ§Ãµes sem categoria/bucket neste mÃªs.', 'Reclassificar pendentes', NULL, 24)
ON CONFLICT (code) DO NOTHING;

