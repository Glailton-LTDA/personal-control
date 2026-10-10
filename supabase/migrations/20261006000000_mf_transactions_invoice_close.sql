-- Vínculo pagamento -> fatura de cartão: qual ciclo (data de fechamento) esta
-- transferência paga. Sem o vínculo o FIFO só encaixava o pagamento nas
-- faturas FECHADAS mais antigas da janela e a fatura corrente nunca mudava
-- ("marquei como paga e não aconteceu nada"). Com o vínculo o pagamento cai
-- na fatura certa (inclusive na corrente, mesmo agendada para o vencimento).
alter table public.mf_transactions
  add column if not exists invoice_close date;

comment on column public.mf_transactions.invoice_close is
  'Fatura de cartão paga por esta transferência (closeISO do ciclo). NULL = pagamento histórico sem vínculo (alocado em FIFO).';
