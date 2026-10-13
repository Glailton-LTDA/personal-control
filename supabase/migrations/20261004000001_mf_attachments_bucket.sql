-- =============================================================
-- Minhas Finanças — Fase 3: bucket de anexos dos lançamentos
-- Bucket privado mf-attachments + políticas de storage
-- (dono = auth.uid(), mesmo padrão do módulo Viagens)
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mf-attachments',
  'mf-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mf: view own attachments" ON storage.objects;
CREATE POLICY "mf: view own attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mf-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS "mf: upload own attachments" ON storage.objects;
CREATE POLICY "mf: upload own attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mf-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS "mf: delete own attachments" ON storage.objects;
CREATE POLICY "mf: delete own attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mf-attachments' AND owner = auth.uid());
