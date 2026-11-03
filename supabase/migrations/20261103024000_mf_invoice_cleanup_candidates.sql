-- Relatório de limpeza: espelhos automáticos históricos (PAGO, fechamento
-- anterior ao mês corrente) e ajustes automáticos. NÃO altera nada; expõe
-- as linhas candidatas e o efeito no saldo da conta caso sejam canceladas.
create or replace view public.mf_invoice_cleanup_candidates
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.account_id,
  a.name as account_name,
  t.payment_date,
  t.amount,
  t.status,
  t.invoice_close,
  t.notes,
  t.created_at,
  case
    when t.notes = 'Agendado automaticamente (fatura)' then 'auto_mirror'
    else 'auto_adjustment'
  end as kind,
  (-t.amount)::numeric(14, 2) as balance_effect
from public.mf_transactions t
join public.mf_accounts a on a.id = t.account_id
where t.status <> 'CANCELADO'
  and (
    t.notes = 'Ajuste de fatura (reajuste de valor)'
    or (
      t.notes = 'Agendado automaticamente (fatura)'
      and t.status = 'PAGO'
      and t.invoice_close is not null
      and t.invoice_close < date_trunc('month', current_date)::date
    )
  );

revoke all on public.mf_invoice_cleanup_candidates from public, anon;
grant select on public.mf_invoice_cleanup_candidates to authenticated;
