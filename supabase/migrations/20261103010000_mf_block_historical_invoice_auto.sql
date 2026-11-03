-- Impede o agendador de recriar ajustes/pagamentos automáticos em faturas
-- já fechadas. O backfill mudou totais históricos e o planner reagia criando
-- "Ajuste de fatura" em cima de faturas pagas. O código novo já ignora
-- faturas anteriores ao mês corrente; este trigger é a rede de segurança
-- para abas/código antigos que ainda estejam abertos.
--
-- Marcadores (notes):
--   'Ajuste de fatura (reajuste de valor)'  -> diferença automática
--   'Agendado automaticamente (fatura)'     -> espelho de pagamento
-- Só bloqueia quando o fechamento é anterior ao mês corrente.

create or replace function public.mf_block_historical_invoice_auto()
returns trigger
language plpgsql
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
begin
  if new.notes = 'Ajuste de fatura (reajuste de valor)'
     and new.invoice_close is not null
     and new.invoice_close < v_month_start then
    raise exception 'Agendador: fatura histórica não pode ser reajustada automaticamente';
  end if;

  if new.notes = 'Agendado automaticamente (fatura)'
     and new.invoice_close is not null
     and new.invoice_close < v_month_start then
    raise exception 'Agendador: pagamento de fatura histórica não pode ser criado automaticamente';
  end if;

  if tg_op = 'UPDATE'
     and new.notes = 'Agendado automaticamente (fatura)'
     and new.amount is distinct from old.amount
     and new.invoice_close is not null
     and new.invoice_close < v_month_start then
    raise exception 'Agendador: pagamento de fatura histórica não pode ser alterado automaticamente';
  end if;

  return new;
end;
$$;

drop trigger if exists mf_block_historical_invoice_auto on public.mf_transactions;

create trigger mf_block_historical_invoice_auto
before insert or update on public.mf_transactions
for each row execute function public.mf_block_historical_invoice_auto();
