-- FIX: Policies minimas para criar org e primeiro membro
-- Execute no Supabase SQL Editor se estiver recebendo "Permissao negada no banco (RLS)"

-- 1) Funcoes helper (se nao existirem)
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

-- 2) Policy orgs_insert: usuario autenticado pode criar org
DROP POLICY IF EXISTS "orgs_insert" ON orgs;
CREATE POLICY "orgs_insert" ON orgs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Policy org_members_insert: bootstrap do primeiro admin (00005)
DROP POLICY IF EXISTS "org_members_insert" ON org_members;
CREATE POLICY "org_members_insert" ON org_members FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM org_members writer_member
      WHERE writer_member.org_id = org_members.org_id
        AND writer_member.user_id = auth.uid()
        AND writer_member.role IN ('admin'::member_role, 'financeiro'::member_role)
    )
    OR (
      auth.uid() = user_id
      AND role = 'admin'::member_role
      AND NOT EXISTS (
        SELECT 1 FROM org_members existing_member
        WHERE existing_member.org_id = org_members.org_id
      )
    )
  )
);
