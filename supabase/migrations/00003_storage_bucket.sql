-- Storage bucket para anexos (por org)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: usuário só acessa arquivos de orgs em que é membro
-- Path format: {org_id}/{transaction_id}/{filename}
CREATE POLICY "attachments_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "attachments_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro'))
  );
CREATE POLICY "attachments_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1]::uuid IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro'))
  );
