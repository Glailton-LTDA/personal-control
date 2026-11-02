-- Reparo dos fechamentos de fatura do Nubank (fecha 31, vence 07).
--
-- 1) Parcelas criadas pela série mensal herdavam o dia 30 nos meses de 31
--    dias (30/12, 30/01, ...) porque o fechamento era avançado com
--    addMonthsISO (clamp no dia). Esses ciclos não existem em cardCycles
--    (31/12, 31/01, ...), então a parcela ficava fora da fatura. Normaliza
--    todo invoice_close de cartão que fecha no último dia do mês.
update public.mf_transactions t
set invoice_close = (date_trunc('month', t.invoice_close) + interval '1 month - 1 day')::date
from public.mf_accounts a
where a.id = t.account_id
  and a.account_type = 'CARTAO'
  and a.closing_day = 31
  and t.invoice_close is not null
  and extract(day from t.invoice_close)
      <> extract(day from (date_trunc('month', t.invoice_close) + interval '1 month - 1 day'));

-- 2) Parcelas Amazon que continuavam no fechamento da cabeça e entravam na
--    fatura errada: a 3/3 (12/12) caía em novembro e a 6/6 (13/01/27) em
--    dezembro. Com os dois vínculos corrigidos, novembro fecha em 2.482,34
--    e dezembro em 1.899,28 — os totais conferidos com o banco.
--
--    Elas vão para o ciclo que fecha em 31/12 (fatura de janeiro), o
--    próximo ciclo livre depois das parcelas anteriores (2/3 em novembro e
--    5/6 em dezembro). O agendador recalcula o espelho de janeiro sozinho.
update public.mf_transactions
set invoice_close = '2026-12-31'
where id in (
  '892ccfd0-40bb-4a77-b531-b11b8350d699', -- Compras Amazon 3/3, 37,80, 12/12/2026
  '8dd81162-49f0-4c46-a080-b9c6e1ac0047'  -- Compras Amazon 6/6, 46,83, 13/01/2027
)
and invoice_close <> '2026-12-31';

-- 3) Espelhos de pagamento das faturas afetadas: sem isso, o espelho de
--    dezembro continuaria em 1.946,11 (46,83 acima) e o de janeiro em
--    750,96 (37,80 + 46,83 abaixo) até o agendador rodar. Atualiza só o
--    espelho automático pendente do Nubank; o pagamento manual do usuário
--    nunca é tocado.
update public.mf_transactions
set amount = case invoice_close
  when '2026-11-30' then 1899.28
  when '2026-12-31' then 1123.00
  else amount
end
where account_id = 'c55ae8a2-641d-0c6b-b349-b0c684ea7a22'
  and invoice_close in ('2026-11-30', '2026-12-31')
  and status = 'PENDENTE'
  and notes = 'Agendado automaticamente (fatura)';
