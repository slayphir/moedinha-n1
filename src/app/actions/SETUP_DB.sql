
-- Insights / Alertas Gerados
CREATE TYPE insight_type AS ENUM ('spending_spike', 'goal_risk', 'new_recurrence', 'budget_overflow', 'opportunity');
CREATE TYPE insight_status AS ENUM ('active', 'dismissed', 'acted');

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  type insight_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity alert_severity DEFAULT 'info', -- Reuses alert_severity enum
  
  metadata JSONB DEFAULT '{}', -- Contexto (category_id, amounts, etc.)
  
  status insight_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_org ON insights(org_id);
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insights_select" ON insights FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids()));
CREATE POLICY "insights_insert" ON insights FOR INSERT WITH CHECK (public.user_can_write_org(org_id));
CREATE POLICY "insights_update" ON insights FOR UPDATE USING (public.user_can_write_org(org_id));
CREATE POLICY "insights_delete" ON insights FOR DELETE USING (public.user_can_write_org(org_id));

