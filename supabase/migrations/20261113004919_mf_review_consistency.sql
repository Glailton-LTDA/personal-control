-- Authoritative invoice balances, serialized payment operations and cache deltas.
set lock_timeout = '5s';
set statement_timeout = '60s';
create schema if not exists mf_private;
revoke all on schema mf_private from public, anon, authenticated;
-- Operation receipts are shared by every client, never a second financial ledger.
create table if not exists mf_private.payment_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key (user_id, operation_id)
);
alter table mf_private.payment_operations enable row level security;
revoke all on mf_private.payment_operations from public, anon, authenticated;

-- Same national calendar as src/lib/mfBusinessDays.js (including Good Friday).
create or replace function mf_private.next_business_day(p_date date)
returns date language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare
  y int; a int; b int; c int; d int; e int; f int; g int;
  h int; i int; k int; l int; m int; easter date; result date := p_date;
begin
  loop
    y := extract(year from result); a := y % 19; b := y / 100; c := y % 100;
    d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
    h := (19*a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
    l := (32 + 2*e + 2*i - h - k) % 7; m := (a + 11*h + 22*l) / 451;
    easter := make_date(y, (h+l-7*m+114)/31, (h+l-7*m+114)%31+1);
    exit when extract(isodow from result) < 6
      and to_char(result,'MM-DD') not in ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25')
      and not (y >= 2024 and to_char(result,'MM-DD')='11-20')
      and result <> easter - 2;
    result := result + 1;
  end loop;
  return result;
end $$;

-- Includes legacy purchases (due month), historical linked accounts,
-- negative credits and FIFO transfers. Target pending payments are replaceable,
-- not extra principal. No client-supplied amount participates in this calculation.
create or replace function mf_private.card_open_amount(p_card_id uuid, p_close date)
returns numeric language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
  uid uuid := auth.uid(); card public.mf_accounts; cfg jsonb; cycle record;
  first_month date; month_date date; close_date date; due_month date;
  due_date date; c int; d int; total numeric; bound numeric; pool numeric;
  billable numeric; covered numeric; remaining numeric; result numeric := 0;
  linked uuid[]; cycle_data jsonb := '[]'; official public.mf_invoices;
begin
  select * into card from public.mf_accounts where id=p_card_id and user_id=uid;
  if not found then raise exception 'mf_pay_card_not_found'; end if;
  select array_agg(distinct id) into linked from (
    select card.linked_account_id as id union all
    select linked_account_id from public.mf_card_settings where card_id=p_card_id and user_id=uid
  ) a;
  select date_trunc('month',least(coalesce(min(least(payment_date,invoice_close)),p_close),p_close))::date - interval '2 months'
    into first_month from public.mf_transactions
    where user_id=uid and (account_id=p_card_id or transfer_account_id=p_card_id or account_id=any(linked));
  for month_date in select generate_series(first_month,date_trunc('month',p_close),interval '1 month')::date loop
    select to_jsonb(s) into cfg from public.mf_card_settings s
      where s.card_id=p_card_id and s.user_id=uid and s.effective_from <= to_char(month_date,'YYYY-MM')
      order by s.effective_from desc limit 1;
    cfg := coalesce(cfg,to_jsonb(card));
    c := coalesce((cfg->>'closing_day')::int,1); d := coalesce((cfg->>'due_day')::int,10);
    close_date := month_date + least(c,extract(day from month_date+interval '1 month - 1 day')::int)-1;
    if coalesce((cfg->>'closing_dynamic')::boolean,false) then close_date := mf_private.next_business_day(close_date); end if;
    due_month := date_trunc('month',close_date)::date;
    if d < (case when coalesce((cfg->>'closing_dynamic')::boolean,false) then extract(day from close_date)::int else c end)
      then due_month := (due_month + interval '1 month')::date; end if;
    due_date := due_month + least(d,extract(day from due_month+interval '1 month - 1 day')::int)-1;
    if coalesce((cfg->>'due_business_days')::boolean,false) then due_date := mf_private.next_business_day(due_date); end if;
    cycle_data := cycle_data || jsonb_build_array(jsonb_build_object('close',close_date,'due_month',to_char(due_date,'YYYY-MM')));
  end loop;
  select coalesce(sum(amount),0) into pool from public.mf_transactions
    where user_id=uid and type='TRANSFERENCIA' and transfer_account_id=p_card_id
      and invoice_close is null and status <> 'CANCELADO' and payment_date <= current_date;
  remaining := greatest(0,pool);
  for cycle in
    select distinct (x->>'close')::date as close_date, x->>'due_month' as due_month from jsonb_array_elements(cycle_data) x
    union
    select distinct invoice_close, null from public.mf_transactions
      where user_id=uid and account_id=p_card_id and invoice_close is not null
        and invoice_close<=p_close and not exists (
          select 1 from jsonb_array_elements(cycle_data) x where (x->>'close')::date=invoice_close)
    union select p_close,null where not exists(select 1 from jsonb_array_elements(cycle_data) x where (x->>'close')::date=p_close)
    order by 1
  loop
    if cycle.close_date>p_close then continue; end if;
    select coalesce(sum(amount),0) into total from public.mf_transactions
      where user_id=uid and account_id=p_card_id and type='DESPESA' and status<>'CANCELADO'
        and (invoice_close=cycle.close_date or (invoice_close is null and to_char(payment_date,'YYYY-MM')=cycle.due_month));
    select coalesce(sum(amount),0) into bound from public.mf_transactions
      where user_id=uid and status<>'CANCELADO'
        and (cycle.close_date<>p_close or status<>'PENDENTE')
        and invoice_close=cycle.close_date
        and ((type='DESPESA' and account_id=any(linked)) or (type='TRANSFERENCIA' and transfer_account_id=p_card_id))
        and not (coalesce(notes,'') in ('Agendado automaticamente (fatura)','Ajuste de fatura (reajuste de valor)')
          and date_trunc('month',invoice_close)<date_trunc('month',current_date));
    -- Respect imported/manual official totals without discarding new payments.
    select * into official from public.mf_invoices inv where inv.user_id=uid and inv.card_id=p_card_id
      and inv.close_date=cycle.close_date and total_source in ('manual','imported') limit 1;
    if found then total := official.total; bound := greatest(bound,official.paid_total); end if;
    billable := greatest(0,total);
    covered := least(remaining,greatest(0,billable-bound));
    result := round(greatest(0,billable-bound-covered),2);
    remaining := greatest(0,remaining-covered)+greatest(0,bound-billable)+greatest(0,-total);
    if cycle.close_date=p_close then return result; end if;
  end loop;
  return 0;
end $$;
revoke all on function mf_private.next_business_day(date) from public,anon,authenticated;
revoke all on function mf_private.card_open_amount(uuid,date) from public,anon,authenticated;

drop function public.mf_pay_card_invoice(uuid,uuid,date,jsonb,jsonb,boolean,numeric);
CREATE OR REPLACE FUNCTION public.mf_pay_card_invoice(
  p_card_id UUID,
  p_account_id UUID,
  p_invoice_close DATE,
  p_payment JSONB DEFAULT NULL,
  p_extras JSONB DEFAULT '[]'::jsonb,
  p_replace_all BOOLEAN DEFAULT false,
  p_open_amount NUMERIC DEFAULT NULL,
  p_operation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_request jsonb;
  v_receipt mf_private.payment_operations;
  v_result jsonb;
  v_financed numeric := 0;
  v_credit_count int := 0;
  v_installments numeric := 0;
  v_linked UUID;
  v_row public.mf_transactions;
  v_payment_row public.mf_transactions;
  v_extra_row public.mf_transactions;
  v_existing public.mf_transactions;
  v_pending_rows public.mf_transactions[] := '{}'::public.mf_transactions[];
  v_payment_id UUID;
  v_extra_id UUID;
  v_purchases NUMERIC := 0;
  v_paid_final NUMERIC := 0;
  v_pending NUMERIC := 0;
  v_open NUMERIC := 0;
  v_allowed NUMERIC := 0;
  v_extra_ids JSONB := '[]'::jsonb;
  v_deleted_ids JSONB := '[]'::jsonb;
  v_notes_marker TEXT := 'Agendado automaticamente (fatura)';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_pay_card_not_authenticated';
  END IF;

  -- O cartão e a conta vinculada têm que ser do dono.
  SELECT a.linked_account_id INTO v_linked
  FROM public.mf_accounts a
  WHERE a.id = p_card_id AND a.user_id = v_uid AND a.account_type = 'CARTAO'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mf_pay_card_not_found';
  END IF;
  IF v_linked IS DISTINCT FROM p_account_id OR NOT EXISTS (
    SELECT 1 FROM public.mf_accounts WHERE id=p_account_id AND user_id=v_uid
  ) THEN
    RAISE EXCEPTION 'mf_pay_card_account';
  END IF;

  if p_invoice_close is null then raise exception 'mf_pay_card_required'; end if;
  v_request := jsonb_build_object('card',p_card_id,'account',p_account_id,'close',p_invoice_close,
    'payment',p_payment,'extras',p_extras,'replace',p_replace_all);
  if p_operation_id is not null then
    select * into v_receipt from mf_private.payment_operations
      where user_id=v_uid and operation_id=p_operation_id;
    if found then
      if v_receipt.request <> v_request then raise exception 'mf_operation_conflict'; end if;
      return v_receipt.result;
    end if;
  end if;
  -- Trava as linhas pendentes da fatura: nenhuma outra operação entra
  -- enquanto esta não terminar.
  FOR v_row IN
    SELECT t.* FROM public.mf_transactions t
    WHERE t.user_id = v_uid
      AND t.account_id = p_account_id
      AND t.type = 'DESPESA'
      AND t.invoice_close = p_invoice_close
      AND t.status = 'PENDENTE'
    FOR UPDATE
  LOOP
    v_pending_rows := array_append(v_pending_rows, v_row);
  END LOOP;

  v_open := mf_private.card_open_amount(p_card_id,p_invoice_close);
  if v_open <= 0 then raise exception 'mf_pay_card_settled'; end if;
  if p_payment is not null then
    v_payment_row := jsonb_populate_record(null::public.mf_transactions,p_payment);
    if v_payment_row.account_id is distinct from p_account_id or v_payment_row.type is distinct from 'DESPESA'
      or coalesce(v_payment_row.amount,0)<=0 or v_payment_row.status not in ('PAGO','PENDENTE')
      then raise exception 'mf_pay_card_amount'; end if;
  end if;
  for v_extra_row in select * from jsonb_populate_recordset(null::public.mf_transactions,coalesce(p_extras,'[]')) loop
    if v_extra_row.type is distinct from 'DESPESA' or coalesce(v_extra_row.amount,0)=0
      or v_extra_row.status is distinct from 'PAGO' then raise exception 'mf_pay_card_extra'; end if;
    if v_extra_row.account_id=p_card_id then
      if v_extra_row.amount<0 then
        if v_extra_row.invoice_close is distinct from p_invoice_close then raise exception 'mf_pay_card_extra'; end if;
        v_financed := v_financed-v_extra_row.amount; v_credit_count := v_credit_count+1;
      else
        if v_extra_row.invoice_close is null or v_extra_row.invoice_close<=p_invoice_close then raise exception 'mf_pay_card_extra'; end if;
        v_installments := v_installments+v_extra_row.amount;
      end if;
    elsif v_extra_row.account_id is distinct from p_account_id or v_extra_row.amount<0
      or v_extra_row.invoice_close is not null then raise exception 'mf_pay_card_extra_account'; end if;
  end loop;
  if coalesce(v_payment_row.amount,0)+v_financed>v_open then raise exception 'mf_pay_card_amount'; end if;
  if v_financed>0 and (v_credit_count<>1 or v_installments<v_financed
    or coalesce(v_payment_row.amount,0)+v_financed<>v_open) then raise exception 'mf_pay_card_amount'; end if;
  if (p_payment is null and v_financed=0) or (v_financed=0 and v_installments>0)
    then raise exception 'mf_pay_card_amount'; end if;

  -- Pagamento: reusa a linha pendente mais recente (um único débito por
  -- fatura) ou cria uma nova.
  IF p_payment IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM unnest(v_pending_rows) r
    ORDER BY r.payment_date DESC NULLS LAST
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      UPDATE public.mf_transactions SET
        account_id = v_payment_row.account_id,
        type = v_payment_row.type,
        description = v_payment_row.description,
        amount = v_payment_row.amount,
        payment_date = v_payment_row.payment_date,
        due_date = v_payment_row.due_date,
        effective_date = v_payment_row.effective_date,
        status = COALESCE(v_payment_row.status, status),
        category_id = v_payment_row.category_id,
        notes = v_payment_row.notes,
        attachment_path = v_payment_row.attachment_path,
        recurrence = COALESCE(v_payment_row.recurrence, recurrence),
        auto_settle = COALESCE(v_payment_row.auto_settle, auto_settle),
        invoice_close = p_invoice_close
      WHERE id = v_existing.id AND user_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'mf_pay_card_not_found';
      END IF;
      v_payment_id := v_existing.id;
    ELSE
      INSERT INTO public.mf_transactions (
        id, user_id, account_id, transfer_account_id, type, description, amount,
        payment_date, due_date, effective_date, status, category_id, responsible_id,
        notes, attachment_path, recurrence, installments_current, installments_total,
        parent_transaction_id, invoice_close, auto_settle, is_fixed
      ) VALUES (
        COALESCE(v_payment_row.id, gen_random_uuid()), v_uid, v_payment_row.account_id,
        v_payment_row.transfer_account_id, v_payment_row.type, v_payment_row.description,
        v_payment_row.amount, v_payment_row.payment_date, v_payment_row.due_date,
        v_payment_row.effective_date, COALESCE(v_payment_row.status, 'PENDENTE'),
        v_payment_row.category_id, v_payment_row.responsible_id, v_payment_row.notes,
        v_payment_row.attachment_path, COALESCE(v_payment_row.recurrence, 'NONE'),
        v_payment_row.installments_current, v_payment_row.installments_total,
        v_payment_row.parent_transaction_id, p_invoice_close,
        COALESCE(v_payment_row.auto_settle, false), COALESCE(v_payment_row.is_fixed, false)
      ) RETURNING id INTO v_payment_id;
    END IF;
  END IF;

  -- Extras: crédito do parcelamento, parcelas e encargos.
  FOR v_extra_row IN
    SELECT * FROM jsonb_populate_recordset(
      NULL::public.mf_transactions, COALESCE(p_extras, '[]'::jsonb)
    )
  LOOP
    IF v_extra_row.account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.mf_accounts a
      WHERE a.id = v_extra_row.account_id AND a.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'mf_pay_card_extra_account';
    END IF;
    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    ) VALUES (
      COALESCE(v_extra_row.id, gen_random_uuid()), v_uid, v_extra_row.account_id,
      v_extra_row.transfer_account_id, v_extra_row.type, v_extra_row.description,
      v_extra_row.amount, v_extra_row.payment_date, v_extra_row.due_date,
      v_extra_row.effective_date, COALESCE(v_extra_row.status, 'PENDENTE'),
      v_extra_row.category_id, v_extra_row.responsible_id, v_extra_row.notes,
      v_extra_row.attachment_path, COALESCE(v_extra_row.recurrence, 'NONE'),
      v_extra_row.installments_current, v_extra_row.installments_total,
      v_extra_row.parent_transaction_id, v_extra_row.invoice_close,
      COALESCE(v_extra_row.auto_settle, false), COALESCE(v_extra_row.is_fixed, false)
    ) RETURNING id INTO v_extra_id;
    v_extra_ids := v_extra_ids || to_jsonb(v_extra_id);
  END LOOP;

  -- Espelhos: quando há pagamento, sai só o espelho duplicado; sem
  -- pagamento (fatura totalmente financiada), sai tudo.
  FOR v_row IN SELECT * FROM unnest(v_pending_rows) r
  LOOP
    IF p_replace_all
       OR (p_payment IS NOT NULL
           AND v_row.notes = v_notes_marker
           AND v_row.id IS DISTINCT FROM v_payment_id) THEN
      DELETE FROM public.mf_transactions WHERE id = v_row.id AND user_id = v_uid;
      v_deleted_ids := v_deleted_ids || to_jsonb(v_row.id);
    END IF;
  END LOOP;

  -- Official imported/manual invoices are authoritative in the clients too.
  update public.mf_invoices inv set
    paid_total=least(inv.total,inv.paid_total+v_financed+case when v_payment_row.status='PAGO' then coalesce(v_payment_row.amount,0) else 0 end),
    status=case when inv.paid_total+v_financed+case when v_payment_row.status='PAGO' then coalesce(v_payment_row.amount,0) else 0 end>=inv.total
      then 'PAID' else inv.status end
  where inv.user_id=v_uid and inv.card_id=p_card_id and inv.close_date=p_invoice_close and inv.total_source in ('manual','imported');
  v_result := jsonb_build_object(
    'payment_id',v_payment_id,'extra_ids',v_extra_ids,'deleted_ids',v_deleted_ids,
    'tables',jsonb_build_object('mf_transactions',jsonb_build_object(
      'rows',coalesce((select jsonb_agg(to_jsonb(t)) from public.mf_transactions t
        where t.user_id=v_uid and (t.id=v_payment_id or t.id in (select value::uuid from jsonb_array_elements_text(v_extra_ids)))),'[]'),
      'deleted_ids',v_deleted_ids),
      'mf_invoices',jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(inv)) from public.mf_invoices inv
        where inv.user_id=v_uid and inv.card_id=p_card_id and inv.close_date=p_invoice_close),'[]'),'deleted_ids','[]'::jsonb)));
  if p_operation_id is not null then
    insert into mf_private.payment_operations(user_id,operation_id,request,result)
      values(v_uid,p_operation_id,v_request,v_result);
  end if;
  return v_result;
END;
$$;

revoke all on function public.mf_pay_card_invoice(uuid,uuid,date,jsonb,jsonb,boolean,numeric,uuid) from public,anon;
grant execute on function public.mf_pay_card_invoice(uuid,uuid,date,jsonb,jsonb,boolean,numeric,uuid) to authenticated;


CREATE OR REPLACE FUNCTION public.mf_save_tx_with_goal(
  p_operation_id UUID,
  p_tx JSONB,
  p_goal_contribution JSONB DEFAULT NULL,
  p_delete_contribution BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.mf_transactions;
  v_contribution public.mf_goal_contributions;
  v_tx_id UUID;
  v_contribution_id UUID;
  v_exists BOOLEAN := false;
  v_deleted jsonb := '[]';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_not_authenticated';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;

  v_row := jsonb_populate_record(NULL::public.mf_transactions, COALESCE(p_tx, '{}'::jsonb));
  IF v_row.type IS NULL OR v_row.type NOT IN ('DESPESA','RECEITA') THEN
    RAISE EXCEPTION 'mf_goal_tx_type';
  END IF;
  IF v_row.account_id IS NULL OR v_row.description IS NULL OR btrim(v_row.description) = '' THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;
  IF COALESCE(v_row.amount, 0) = 0 OR v_row.payment_date IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mf_accounts a
    WHERE a.id = v_row.account_id AND a.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'mf_goal_tx_account';
  END IF;

  -- O id da operação É o id do lançamento: o retry manda o mesmo id e o
  -- servidor reconhece a repetição em vez de criar outra receita.
  v_tx_id := p_operation_id;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_tx_id::text,0));

  SELECT EXISTS (
    SELECT 1 FROM public.mf_transactions WHERE id = v_tx_id
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.mf_transactions SET
      account_id = v_row.account_id,
      transfer_account_id = v_row.transfer_account_id,
      type = v_row.type,
      description = v_row.description,
      amount = v_row.amount,
      payment_date = v_row.payment_date,
      due_date = v_row.due_date,
      effective_date = v_row.effective_date,
      status = COALESCE(v_row.status, status),
      category_id = v_row.category_id,
      notes = v_row.notes,
      attachment_path = v_row.attachment_path,
      recurrence = COALESCE(v_row.recurrence, recurrence),
      invoice_close = v_row.invoice_close,
      auto_settle = COALESCE(v_row.auto_settle, auto_settle)
    WHERE id = v_tx_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_goal_tx_not_found';
    END IF;
  ELSE
    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    ) VALUES (
      v_tx_id, v_uid, v_row.account_id, v_row.transfer_account_id, v_row.type,
      v_row.description, v_row.amount, v_row.payment_date, v_row.due_date,
      v_row.effective_date, COALESCE(v_row.status, 'PENDENTE'), v_row.category_id,
      v_row.responsible_id, v_row.notes, v_row.attachment_path,
      COALESCE(v_row.recurrence, 'NONE'), v_row.installments_current,
      v_row.installments_total, v_row.parent_transaction_id, v_row.invoice_close,
      COALESCE(v_row.auto_settle, false), COALESCE(v_row.is_fixed, false)
    );
  END IF;

  -- Aporte do objetivo: uma linha por lançamento (índice único em
  -- transaction_id). O retry atualiza a mesma linha.
  IF p_goal_contribution IS NOT NULL THEN
    v_contribution := jsonb_populate_record(
      NULL::public.mf_goal_contributions, p_goal_contribution
    );
    IF v_contribution.goal_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.mf_goals g
         WHERE g.id = v_contribution.goal_id AND g.user_id = v_uid
       ) THEN
      RAISE EXCEPTION 'mf_goal_contribution_goal';
    END IF;
    IF COALESCE(v_contribution.amount, 0) <= 0
       OR v_contribution.contribution_date IS NULL THEN
      RAISE EXCEPTION 'mf_goal_contribution_required';
    END IF;

    SELECT id INTO v_contribution_id
    FROM public.mf_goal_contributions
    WHERE transaction_id = v_tx_id AND user_id = v_uid;

    IF v_contribution_id IS NOT NULL THEN
      UPDATE public.mf_goal_contributions SET
        goal_id = v_contribution.goal_id,
        kind = v_contribution.kind,
        amount = v_contribution.amount,
        contribution_date = v_contribution.contribution_date,
        notes = v_contribution.notes,
        updated_at = now()
      WHERE id = v_contribution_id AND user_id = v_uid;
    ELSE
      INSERT INTO public.mf_goal_contributions (
        id, user_id, goal_id, kind, amount, contribution_date, notes,
        transaction_id, updated_at
      ) VALUES (
        COALESCE(v_contribution.id, gen_random_uuid()), v_uid, v_contribution.goal_id,
        v_contribution.kind, v_contribution.amount, v_contribution.contribution_date,
        v_contribution.notes, v_tx_id, now()
      ) RETURNING id INTO v_contribution_id;
    END IF;
  ELSIF p_delete_contribution THEN
    select coalesce(jsonb_agg(id),'[]') into v_deleted from public.mf_goal_contributions where transaction_id=v_tx_id and user_id=v_uid;
    DELETE FROM public.mf_goal_contributions
    WHERE transaction_id = v_tx_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'contribution_id', v_contribution_id,
    'tables',jsonb_build_object(
      'mf_transactions',jsonb_build_object('rows',(select jsonb_agg(to_jsonb(t)) from public.mf_transactions t where id=v_tx_id and user_id=v_uid),'deleted_ids','[]'::jsonb),
      'mf_goal_contributions',jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(c)) from public.mf_goal_contributions c where id=v_contribution_id and user_id=v_uid),'[]'),'deleted_ids',v_deleted))
  );
END;
$$;

revoke all on function public.mf_save_tx_with_goal(uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.mf_save_tx_with_goal(uuid,jsonb,jsonb,boolean) to authenticated;
