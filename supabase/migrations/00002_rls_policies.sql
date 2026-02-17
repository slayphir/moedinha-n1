-- Ensure helper functions exist before creating policies.
-- Some environments run this migration without having executed the
-- helper-function section from 00001.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_role_in_org(org_uuid UUID)
RETURNS member_role AS $$
  SELECT role FROM public.org_members WHERE org_id = org_uuid AND user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_write_org(org_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = org_uuid AND user_id = auth.uid() AND role IN ('admin', 'financeiro')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.user_role_in_org(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_org(UUID) TO authenticated, anon, service_role;
-- RLS Policies: isolamento por org + RBAC (admin, financeiro, leitura)

-- Orgs: sÃ³ ver orgs em que Ã© membro
CREATE POLICY "orgs_select" ON orgs FOR SELECT
  USING (id IN (SELECT public.user_org_ids()));
CREATE POLICY "orgs_insert" ON orgs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "orgs_update" ON orgs FOR UPDATE
  USING (public.can_write_org(id));

-- Org members: ver/gerir apenas na prÃ³pria org (admin)
CREATE POLICY "org_members_select" ON org_members FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "org_members_insert" ON org_members FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "org_members_update" ON org_members FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "org_members_delete" ON org_members FOR DELETE
  USING (public.user_role_in_org(org_id) = 'admin');

-- Profiles: usuÃ¡rio vÃª/edita sÃ³ o prÃ³prio
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Accounts: leitura para todos da org; escrita admin/financeiro
CREATE POLICY "accounts_select" ON accounts FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "accounts_insert" ON accounts FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids()) AND public.can_write_org(org_id));
CREATE POLICY "accounts_update" ON accounts FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "accounts_delete" ON accounts FOR DELETE
  USING (public.can_write_org(org_id));

-- Categories
CREATE POLICY "categories_select" ON categories FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "categories_insert" ON categories FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "categories_update" ON categories FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "categories_delete" ON categories FOR DELETE
  USING (public.can_write_org(org_id));

-- Tags
CREATE POLICY "tags_select" ON tags FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "tags_insert" ON tags FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "tags_update" ON tags FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "tags_delete" ON tags FOR DELETE
  USING (public.can_write_org(org_id));

-- Transactions (inclui soft delete: deleted_at)
CREATE POLICY "transactions_select" ON transactions FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "transactions_insert" ON transactions FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids()) AND public.can_write_org(org_id));
CREATE POLICY "transactions_update" ON transactions FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "transactions_delete" ON transactions FOR UPDATE
  USING (public.can_write_org(org_id)); -- soft delete via updated_at/deleted_at

-- Transaction tags
CREATE POLICY "transaction_tags_select" ON transaction_tags FOR SELECT
  USING (
    transaction_id IN (SELECT id FROM transactions WHERE org_id IN (SELECT public.user_org_ids()))
  );
CREATE POLICY "transaction_tags_insert" ON transaction_tags FOR INSERT
  WITH CHECK (
    transaction_id IN (SELECT id FROM transactions t WHERE t.org_id IN (SELECT public.user_org_ids()) AND public.can_write_org(t.org_id))
  );
CREATE POLICY "transaction_tags_delete" ON transaction_tags FOR DELETE
  USING (
    transaction_id IN (SELECT id FROM transactions t WHERE public.can_write_org(t.org_id))
  );

-- Recurring rules
CREATE POLICY "recurring_rules_select" ON recurring_rules FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "recurring_rules_insert" ON recurring_rules FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "recurring_rules_update" ON recurring_rules FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "recurring_rules_delete" ON recurring_rules FOR DELETE
  USING (public.can_write_org(org_id));

-- Recurring runs
CREATE POLICY "recurring_runs_select" ON recurring_runs FOR SELECT
  USING (rule_id IN (SELECT id FROM recurring_rules WHERE org_id IN (SELECT public.user_org_ids())));
CREATE POLICY "recurring_runs_insert" ON recurring_runs FOR INSERT
  WITH CHECK (rule_id IN (SELECT id FROM recurring_rules r WHERE public.can_write_org(r.org_id)));

-- Budgets
CREATE POLICY "budgets_select" ON budgets FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "budgets_insert" ON budgets FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "budgets_update" ON budgets FOR UPDATE
  USING (public.can_write_org(org_id));
CREATE POLICY "budgets_delete" ON budgets FOR DELETE
  USING (public.can_write_org(org_id));

-- Attachments
CREATE POLICY "attachments_select" ON attachments FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "attachments_insert" ON attachments FOR INSERT
  WITH CHECK (public.can_write_org(org_id));
CREATE POLICY "attachments_delete" ON attachments FOR DELETE
  USING (public.can_write_org(org_id));

-- Audit logs: apenas leitura para membros da org
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- API tokens: apenas admin
CREATE POLICY "api_tokens_select" ON api_tokens FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()) AND public.user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_insert" ON api_tokens FOR INSERT
  WITH CHECK (public.user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_update" ON api_tokens FOR UPDATE
  USING (public.user_role_in_org(org_id) = 'admin');
CREATE POLICY "api_tokens_delete" ON api_tokens FOR DELETE
  USING (public.user_role_in_org(org_id) = 'admin');



