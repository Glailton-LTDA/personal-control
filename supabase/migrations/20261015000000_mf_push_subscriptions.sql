-- Lembretes com push (Minhas Finanças, Fase 2): inscrições Web Push por
-- usuário/aparelho. O opt-in é feito no sino do Resumo; a Edge Function
-- `mf-reminders` (cron diário) lê esta tabela com service_role e envia via
-- web-push/VAPID. Inscrições mortas (410/404) são apagadas pela function.
-- Contas "Ignorar nos totais" TAMBÉM geram lembrete (decisão do usuário).
CREATE TABLE IF NOT EXISTS public.mf_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mf_push_subscriptions_user_id_idx
  ON public.mf_push_subscriptions (user_id);

ALTER TABLE public.mf_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows: select" ON public.mf_push_subscriptions;
CREATE POLICY "own rows: select" ON public.mf_push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: insert" ON public.mf_push_subscriptions;
CREATE POLICY "own rows: insert" ON public.mf_push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: update" ON public.mf_push_subscriptions;
CREATE POLICY "own rows: update" ON public.mf_push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: delete" ON public.mf_push_subscriptions;
CREATE POLICY "own rows: delete" ON public.mf_push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
