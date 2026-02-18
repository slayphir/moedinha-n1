-- ============================================================
-- MIGRATION: 00009_create_contacts_table.sql
-- ============================================================

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relationship TEXT, -- familia, amigo, trabalho, outro
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (public.can_write_org(org_id));

CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (public.can_write_org(org_id));

CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (public.can_write_org(org_id));
