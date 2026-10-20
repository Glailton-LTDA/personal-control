-- =============================================================
-- Minhas Finanças — efetivação automática opcional por lançamento.
--
-- MOTIVO (usuário, 20/10/2026): a efetivação automática deve ser
-- escolha na hora de criar despesa/receita/transferência, com
-- DEFAULT FALSE. Com false (default) o lançamento NUNCA vira PAGO
-- sozinho — só efetivação manual (Efetivar); com true o cliente
-- promove PENDENTE → PAGO quando payment_date <= hoje
-- (planAutoSettle/useMFEffectivateDue).
--
-- O espelho de pagamento de fatura do agendador (nota "Agendado
-- automaticamente (fatura)") NÃO usa esta coluna: segue automático
-- pelo marcador, preservando o invariante "não existe fatura
-- vencida não paga" (decisão P3 da rodada).
-- =============================================================
ALTER TABLE public.mf_transactions
  ADD COLUMN IF NOT EXISTS auto_settle boolean NOT NULL DEFAULT false;
