-- Alocação FIFO de pagamentos REAIS por fatura, para auditoria.
--
-- Fonte de pagamento real:
--   - transferências legadas para o cartão (sem invoice_close), que formam
--     o pool FIFO histórico;
--   - DESPESA vinculada na conta do cartão com invoice_close, EXCLUINDO
--     espelhos automáticos e ajustes automáticos.
--
-- A alocação segue a mesma regra do buildCardInvoices: o pool do cartão
-- paga as faturas mais antigas primeiro; o pagamento real vinculado cai
-- direto na fatura do seu invoice_close.
create or replace view public.mf_invoice_audit_fifo
with (security_invoker = true)
as
with pools as (
  select
    t.card_id,
    coalesce(sum(t.amount) filter (where t.status = 'PAGO'), 0) as pool
  from public.mf_invoice_legacy_transfers t
  group by t.card_id
),
invoices as (
  select
    i.*,
    row_number() over (partition by i.card_id order by i.close_date) as rn,
    sum(i.total) over (
      partition by i.card_id
      order by i.close_date
      rows between unbounded preceding and current row
    ) as cum_total
  from public.mf_invoices i
),
bound_real as (
  select
    i.id as invoice_id,
    coalesce(sum(p.amount), 0) as real_paid
  from public.mf_invoices i
  join public.mf_accounts a on a.id = i.card_id
  join public.mf_transactions p
    on p.account_id = a.linked_account_id
   and p.invoice_close = i.close_date
   and p.type = 'DESPESA'
   and p.status = 'PAGO'
   and coalesce(p.notes, '') not in (
     'Agendado automaticamente (fatura)',
     'Ajuste de fatura (reajuste de valor)'
   )
  group by i.id
)
select
  i.id,
  i.user_id,
  i.card_id,
  a.name as card_name,
  i.close_date,
  i.due_date,
  i.total,
  i.total_source,
  coalesce(p.pool, 0) as legacy_pool,
  least(
    i.total,
    greatest(0, coalesce(p.pool, 0) - (i.cum_total - i.total))
  ) as fifo_allocated,
  coalesce(br.real_paid, 0) as real_paid,
  greatest(
    0,
    i.total
      - least(i.total, greatest(0, coalesce(p.pool, 0) - (i.cum_total - i.total)))
      - coalesce(br.real_paid, 0)
  ) as open_after_real,
  case
    when greatest(
      0,
      i.total
        - least(i.total, greatest(0, coalesce(p.pool, 0) - (i.cum_total - i.total)))
        - coalesce(br.real_paid, 0)
    ) < 0.005 then 'PAID'
    when i.due_date is not null and i.due_date < current_date then 'OVERDUE'
    else 'OPEN'
  end as status_suggested
from invoices i
join public.mf_accounts a on a.id = i.card_id
left join pools p on p.card_id = i.card_id
left join bound_real br on br.invoice_id = i.id;

revoke all on public.mf_invoice_audit_fifo from public, anon;
grant select on public.mf_invoice_audit_fifo to authenticated;
