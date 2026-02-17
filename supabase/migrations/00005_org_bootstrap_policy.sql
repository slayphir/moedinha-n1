-- Permite bootstrap do primeiro membro admin em uma org recem-criada
-- sem abrir permissao de escrita para membros aleatorios.

DROP POLICY IF EXISTS "org_members_insert" ON org_members;

CREATE POLICY "org_members_insert" ON org_members
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM org_members writer_member
      WHERE writer_member.org_id = org_members.org_id
        AND writer_member.user_id = auth.uid()
        AND writer_member.role IN ('admin'::member_role, 'financeiro'::member_role)
    )
    OR (
      auth.uid() = user_id
      AND role = 'admin'::member_role
      AND NOT EXISTS (
        SELECT 1
        FROM org_members existing_member
        WHERE existing_member.org_id = org_members.org_id
      )
    )
  )
);
