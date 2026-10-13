-- -------------------------------------------------------------
-- Multi-moeda: moeda por conta (Fase 2 — extra do Minhas Finanças)
-- Decisão de produto: SEM cotação. Cada conta guarda sua moeda
-- (código ISO 4217 de 3 letras, maiúsculas) e todos os valores
-- são exibidos na moeda nativa da conta. Totais com moedas mistas
-- são separados por moeda na UI (não há soma entre moedas).
-- -------------------------------------------------------------
ALTER TABLE public.mf_accounts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'
  CONSTRAINT mf_accounts_currency_check
    CHECK (char_length(currency) = 3 AND currency = upper(currency));

COMMENT ON COLUMN public.mf_accounts.currency IS
  'Código ISO 4217 da moeda da conta (BRL, USD, EUR, ARS...). Sem conversão/cotação: valores nativos.';
