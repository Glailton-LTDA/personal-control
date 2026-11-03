-- Complementa a view de auditoria com o total dos "Ajuste de fatura"
-- automáticos. Eles são a outra metade do problema: o espelho automático
-- entra como pagamento e o ajuste automático cancela parte dele, deixando
-- um líquido que não corresponde a nenhum pagamento real.
create or replace view public.mf_invoice_audit
with (security_invoker = true)
as
select
  i.id,
  i.user_id,
  i.card_id,
  a.name as card_name,
  i.close_date,
  i.due_date,
  i.total,
  i.total_source,
  i.status,
  i.paid_total,
  coalesce(sum(case when p.id is not null and p.status = 'PAGO' then p.amount else 0 end), 0) as linked_paid,
  coalesce(sum(case when p.id is not null and p.notes = 'Agendado automaticamente (fatura)' and p.status = 'PAGO' then p.amount else 0 end), 0) as auto_note_paid,
  count(p.id) filter (where p.id is not null) as linked_rows,
  coalesce(sum(case when p.id is not null and p.notes = 'Ajuste de fatura (reajuste de valor)' and p.status = 'PAGO' then p.amount else 0 end), 0) as diff_note_paid
from public.mf_invoices i
join public.mf_accounts a on a.id = i.card_id
left join public.mf_transactions p
  on p.account_id = a.linked_account_id
 and p.invoice_close = i.close_date
 and p.type = 'DESPESA'
 and p.status <> 'CANCELADO'
group by i.id, a.name;

revoke all on public.mf_invoice_audit from public, anon;
grant select on public.mf_invoice_audit to authenticated;
