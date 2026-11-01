-- Cartões: fechamento dinâmico e vencimento em dias úteis.
--
-- `closing_dynamic`: se o dia de fechamento cair em fim de semana ou
-- feriado nacional, o ciclo fecha no próximo dia útil.
-- `due_business_days`: se o vencimento cair em fim de semana ou feriado
-- nacional, vence no próximo dia útil.
--
-- Default false nos dois: cartões existentes mantêm exatamente o
-- comportamento atual até o usuário ligar as opções no modal.

ALTER TABLE public.mf_accounts
  ADD COLUMN IF NOT EXISTS closing_dynamic BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_business_days BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mf_accounts.closing_dynamic IS
  'Fecha no próximo dia útil quando o dia de fechamento cai em fim de semana/feriado nacional.';
COMMENT ON COLUMN public.mf_accounts.due_business_days IS
  'Vence no próximo dia útil quando o dia de vencimento cai em fim de semana/feriado nacional.';
