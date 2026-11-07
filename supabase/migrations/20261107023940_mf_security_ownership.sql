-- Sem exclusão, backfill ou reescrita de dados financeiros existentes.
-- Limitar espera por locks: em caso de disputa, falhar e manter o estado anterior.
set lock_timeout = '5s';
set statement_timeout = '60s';
create schema if not exists mf_private;
revoke all on schema mf_private from public, anon, authenticated;

create or replace function mf_private.validate_owner_refs()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(new);
  owner_id uuid := (row_data->>'user_id')::uuid;
  ref record;
  ref_owner uuid;
  linked_trip uuid;
  linked_account uuid;
begin
  if owner_id is null then raise exception 'mf_owner_required' using errcode='42501'; end if;
  -- FKs simples garantem existência, mas não garantem que o dono seja o mesmo.
  for ref in
    select ca.attname as child_column, pn.nspname as parent_schema,
           pc.relname as parent_table, pa.attname as parent_column
    from pg_constraint c
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=c.conkey[1]
    join pg_class pc on pc.oid=c.confrelid
    join pg_namespace pn on pn.oid=pc.relnamespace
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
    where c.conrelid=tg_relid and c.contype='f' and cardinality(c.conkey)=1
      and pn.nspname='public' and left(pc.relname,3)='mf_'
      and exists(select 1 from pg_attribute a where a.attrelid=pc.oid and a.attname='user_id' and not a.attisdropped)
  loop
    if row_data->>ref.child_column is not null then
      execute format('select user_id from %I.%I where %I=$1', ref.parent_schema, ref.parent_table, ref.parent_column)
        into ref_owner using (row_data->>ref.child_column)::uuid;
      if ref_owner is distinct from owner_id then
        raise exception 'mf_reference_not_authorized: %', ref.child_column using errcode='42501';
      end if;
    end if;
  end loop;
  if tg_table_name='mf_tx_links' then
    if new.trip_id is not null and not exists (
      select 1 from public.trips t where t.id=new.trip_id and (
        t.user_id=owner_id or exists (
          select 1 from public.trip_shares s
          where s.trip_id=t.id and s.status='ACCEPTED' and s.permission='WRITE'
            and lower(s.shared_with_email)=(select lower(email) from auth.users where id=owner_id)
        )
      )
    ) then raise exception 'mf_trip_not_authorized' using errcode='42501'; end if;
    if new.trip_expense_id is not null then
      select user_id,trip_id into ref_owner,linked_trip from public.trip_expenses where id=new.trip_expense_id;
      if ref_owner is distinct from owner_id or linked_trip is distinct from new.trip_id then
        raise exception 'mf_trip_expense_not_authorized' using errcode='42501';
      end if;
    end if;
    if new.investment_account_id is not null and not exists (
      select 1 from public.investment_accounts a where a.id=new.investment_account_id and a.user_id=owner_id
    ) then raise exception 'mf_investment_not_authorized' using errcode='42501'; end if;
    if new.investment_record_id is not null then
      select user_id,account_id into ref_owner,linked_account from public.investment_records where id=new.investment_record_id;
      if ref_owner is distinct from owner_id or linked_account is distinct from new.investment_account_id then
        raise exception 'mf_investment_record_not_authorized' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function mf_private.validate_owner_refs() from public, anon, authenticated;

do $$
declare target record;
begin
  for target in
    select distinct c.conrelid::regclass as table_name
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and n.nspname='public' and left(t.relname,3)='mf_'
  loop
    execute format('create constraint trigger mf_validate_owner_refs after insert or update on %s deferrable initially immediate for each row execute function mf_private.validate_owner_refs()',target.table_name);
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION public.mf_save_tx_linked(
  p_tx JSONB,
  p_tx_id UUID DEFAULT NULL,
  p_trip_id UUID DEFAULT NULL,
  p_investment_account_id UUID DEFAULT NULL,
  p_children JSONB DEFAULT '[]'::jsonb,
  p_paid_by TEXT DEFAULT NULL,
  p_mirror_amount NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
-- SECURITY INVOKER (padrão): as policies de mf_*, trips, trip_expenses e
-- investment_* valem.
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.mf_transactions;
  v_tx_id UUID;
  v_prev public.mf_tx_links;
  v_trip_expense_id UUID;
  v_currency TEXT;
  v_amount NUMERIC;
  v_prev_paid_by TEXT;
  v_mf_type TEXT;
  v_inv_currency TEXT;
  v_delta NUMERIC := 0;
  v_record_id UUID;
  v_created BOOLEAN := false;
  v_month_start DATE;
  v_prev_final NUMERIC;
  v_rec public.investment_records;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_tx_link_not_authenticated';
  END IF;

  v_row := jsonb_populate_record(NULL::public.mf_transactions, COALESCE(p_tx, '{}'::jsonb));
  IF v_row.type IS NULL OR v_row.type NOT IN ('DESPESA','RECEITA') THEN
    RAISE EXCEPTION 'mf_tx_link_type';
  END IF;
  IF v_row.account_id IS NULL OR v_row.description IS NULL OR btrim(v_row.description) = '' THEN
    RAISE EXCEPTION 'mf_tx_link_required';
  END IF;
  IF COALESCE(v_row.amount, 0) = 0 OR v_row.payment_date IS NULL THEN
    RAISE EXCEPTION 'mf_tx_link_required';
  END IF;

  IF p_tx_id IS NULL THEN
    v_tx_id := COALESCE(v_row.id, gen_random_uuid());
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

    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    )
    SELECT
      COALESCE(c.id, gen_random_uuid()), v_uid, c.account_id, c.transfer_account_id,
      c.type, c.description, c.amount, c.payment_date, c.due_date, c.effective_date,
      COALESCE(c.status, 'PENDENTE'), c.category_id, c.responsible_id, c.notes,
      c.attachment_path, COALESCE(c.recurrence, 'NONE'), c.installments_current,
      c.installments_total, c.parent_transaction_id, c.invoice_close,
      COALESCE(c.auto_settle, false), COALESCE(c.is_fixed, false)
    FROM jsonb_populate_recordset(
      NULL::public.mf_transactions, COALESCE(p_children, '[]'::jsonb)
    ) AS c;
  ELSE
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
      responsible_id = v_row.responsible_id,
      notes = v_row.notes,
      attachment_path = v_row.attachment_path,
      recurrence = COALESCE(v_row.recurrence, recurrence),
      -- Série: preserva quando o formulário não manda o campo.
      installments_current = COALESCE(v_row.installments_current, installments_current),
      installments_total = COALESCE(v_row.installments_total, installments_total),
      parent_transaction_id = COALESCE(v_row.parent_transaction_id, parent_transaction_id),
      invoice_close = COALESCE(v_row.invoice_close, invoice_close),
      auto_settle = COALESCE(v_row.auto_settle, auto_settle),
      is_fixed = COALESCE(v_row.is_fixed, is_fixed)
    WHERE id = p_tx_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_tx_link_not_found';
    END IF;
    v_tx_id := p_tx_id;
  END IF;

  SELECT * INTO v_prev FROM public.mf_tx_links WHERE transaction_id = v_tx_id FOR UPDATE;
  -- Vínculos antigos também são entrada não confiável: nunca desfazer
  -- efeitos fora do dono autenticado, mesmo antes do novo guard existir.
  IF v_prev.transaction_id IS NOT NULL AND v_prev.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501';
  END IF;
  IF v_prev.trip_expense_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_expenses e WHERE e.id=v_prev.trip_expense_id
      AND e.user_id=v_uid AND e.trip_id=v_prev.trip_id
  ) THEN RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501'; END IF;
  IF v_prev.investment_record_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.investment_records r WHERE r.id=v_prev.investment_record_id
      AND r.user_id=v_uid AND r.account_id=v_prev.investment_account_id
  ) THEN RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501'; END IF;


  -- ---------------------------------------------------------------
  -- Desfaz os efeitos anteriores (edição ou desligar a integração)
  -- ---------------------------------------------------------------
  IF v_prev.trip_expense_id IS NOT NULL THEN
    -- Guarda o responsável atual: ele pode ter sido ajustado direto na
    -- viagem (o nome do perfil é só o padrão de criação).
    SELECT paid_by INTO v_prev_paid_by
    FROM public.trip_expenses WHERE id = v_prev.trip_expense_id;
    DELETE FROM public.trip_expenses WHERE id = v_prev.trip_expense_id;
    v_prev.trip_expense_id := NULL;
    v_prev.trip_id := NULL;
  END IF;

  IF v_prev.investment_record_id IS NOT NULL THEN
    UPDATE public.investment_records
       SET yield = yield - v_prev.investment_delta,
           final_balance = final_balance - v_prev.investment_delta
     WHERE id = v_prev.investment_record_id;
    -- Registro criado pela integração e sem efeito depois de desfazer:
    -- apaga, mas só se for o último da série (senão a corrente dos meses
    -- seguintes perderia a referência do saldo inicial).
    IF v_prev.investment_created THEN
      DELETE FROM public.investment_records ir
       WHERE ir.id = v_prev.investment_record_id
         AND ir.yield = 0
         AND ir.final_balance = ir.initial_balance
         AND NOT EXISTS (
           SELECT 1 FROM public.investment_records later
            WHERE later.account_id = ir.account_id
              AND later.record_date > ir.record_date
         );
    END IF;
    v_prev.investment_record_id := NULL;
    v_prev.investment_account_id := NULL;
  END IF;

  -- ---------------------------------------------------------------
  -- Espelho na viagem
  -- ---------------------------------------------------------------
  IF p_trip_id IS NOT NULL THEN
    IF v_row.type <> 'DESPESA' THEN
      RAISE EXCEPTION 'mf_tx_link_trip_type';
    END IF;
    IF COALESCE(v_row.status, 'PENDENTE') <> 'PAGO' THEN
      RAISE EXCEPTION 'mf_tx_link_status';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id) THEN
      RAISE EXCEPTION 'mf_tx_link_trip_not_found';
    END IF;

    SELECT COALESCE(currency, 'BRL') INTO v_currency
    FROM public.mf_accounts
    WHERE id = v_row.account_id AND user_id = v_uid;
    v_amount := COALESCE(p_mirror_amount, ABS(v_row.amount));

    INSERT INTO public.trip_expenses (
      trip_id, user_id, amount, currency, date, description, paid_by, status, category_id
    ) VALUES (
      p_trip_id, v_uid, v_amount, COALESCE(v_currency, 'BRL'), v_row.payment_date,
      v_row.description,
      -- Na edição, mantém o responsável que já estava no espelho: ele pode
      -- ter sido ajustado na viagem. O nome do perfil é o padrão de criação.
      COALESCE(v_prev_paid_by, NULLIF(btrim(COALESCE(p_paid_by, '')), '')),
      'PAGO', NULL
    ) RETURNING id INTO v_trip_expense_id;
  END IF;

  -- ---------------------------------------------------------------
  -- Rendimento no investimento
  -- ---------------------------------------------------------------
  IF p_investment_account_id IS NOT NULL THEN
    IF COALESCE(v_row.status, 'PENDENTE') <> 'PAGO' THEN
      RAISE EXCEPTION 'mf_tx_link_status';
    END IF;

    SELECT a.account_type, COALESCE(a.currency, 'BRL') INTO v_mf_type, v_currency
    FROM public.mf_accounts a
    WHERE a.id = v_row.account_id AND a.user_id = v_uid;
    IF v_mf_type IS NULL THEN
      RAISE EXCEPTION 'mf_tx_link_required';
    END IF;
    IF v_mf_type = 'CARTAO' THEN
      RAISE EXCEPTION 'mf_tx_link_investment_card';
    END IF;

    SELECT COALESCE(currency, 'BRL') INTO v_inv_currency
    FROM public.investment_accounts
    WHERE id = p_investment_account_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_tx_link_investment_not_found';
    END IF;
    IF v_inv_currency IS DISTINCT FROM COALESCE(v_currency, 'BRL') THEN
      RAISE EXCEPTION 'mf_tx_link_investment_currency';
    END IF;

    v_amount := COALESCE(p_mirror_amount, ABS(v_row.amount));
    v_delta := CASE WHEN v_row.type = 'RECEITA' THEN v_amount ELSE -v_amount END;
    v_month_start := date_trunc('month', v_row.payment_date)::date;
    v_created := false;

    SELECT * INTO v_rec
    FROM public.investment_records
    WHERE account_id = p_investment_account_id
      AND user_id = v_uid
      AND record_date >= v_month_start
      AND record_date < (v_month_start + INTERVAL '1 month')
    ORDER BY record_date DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.investment_records
         SET yield = yield + v_delta,
             final_balance = final_balance + v_delta
       WHERE id = v_rec.id;
      v_record_id := v_rec.id;
      -- Herda o marcador dos vínculos que já usam o registro: se ele foi
      -- criado pela integração, qualquer vínculo pode apagá-lo quando
      -- ficar sem efeito (inclusive depois que o criador for excluído).
      SELECT EXISTS (
        SELECT 1 FROM public.mf_tx_links l
         WHERE l.investment_record_id = v_rec.id
           AND l.investment_created
      ) INTO v_created;
    ELSE
      SELECT final_balance INTO v_prev_final
      FROM public.investment_records
      WHERE account_id = p_investment_account_id
        AND user_id = v_uid
        AND record_date < v_month_start
      ORDER BY record_date DESC
      LIMIT 1;
      v_prev_final := COALESCE(v_prev_final, 0);

      INSERT INTO public.investment_records (
        user_id, account_id, record_date, initial_balance, yield, final_balance
      ) VALUES (
        v_uid, p_investment_account_id, v_row.payment_date,
        v_prev_final, v_delta, v_prev_final + v_delta
      ) RETURNING id INTO v_record_id;
      v_created := true;
    END IF;
  END IF;

  -- ---------------------------------------------------------------
  -- Vínculo
  -- ---------------------------------------------------------------
  IF p_trip_id IS NOT NULL OR p_investment_account_id IS NOT NULL THEN
    INSERT INTO public.mf_tx_links (
      transaction_id, user_id, trip_id, trip_expense_id,
      investment_account_id, investment_record_id, investment_delta, investment_created
    ) VALUES (
      v_tx_id, v_uid, p_trip_id, v_trip_expense_id,
      p_investment_account_id, v_record_id, v_delta, v_created
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      trip_expense_id = EXCLUDED.trip_expense_id,
      investment_account_id = EXCLUDED.investment_account_id,
      investment_record_id = EXCLUDED.investment_record_id,
      investment_delta = EXCLUDED.investment_delta,
      investment_created = EXCLUDED.investment_created,
      updated_at = now();
  ELSIF v_prev.transaction_id IS NOT NULL THEN
    DELETE FROM public.mf_tx_links WHERE transaction_id = v_tx_id;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- Somente a RPC validada mantém os vínculos. Leitura pela aplicação continua.
revoke insert, update, delete on public.mf_tx_links from public, anon, authenticated;
alter function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) security definer;
alter function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) set search_path=pg_catalog,public,pg_temp;
revoke all on function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) from public,anon;
grant execute on function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) to authenticated;

create or replace function public.mf_cleanup_tx_links()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare link public.mf_tx_links;
begin
  select * into link from public.mf_tx_links where transaction_id=old.id and user_id=old.user_id;
  if not found then return old; end if;
  if link.trip_expense_id is not null then
    delete from public.trip_expenses where id=link.trip_expense_id and user_id=old.user_id and trip_id=link.trip_id;
  end if;
  if link.investment_record_id is not null then
    update public.investment_records set yield=yield-link.investment_delta, final_balance=final_balance-link.investment_delta
      where id=link.investment_record_id and user_id=old.user_id and account_id=link.investment_account_id;
    if link.investment_created then
      delete from public.investment_records ir
      where ir.id=link.investment_record_id and ir.user_id=old.user_id and ir.account_id=link.investment_account_id
        and ir.yield=0 and ir.final_balance=ir.initial_balance
        and not exists(select 1 from public.investment_records later where later.account_id=ir.account_id and later.record_date>ir.record_date);
    end if;
  end if;
  delete from public.mf_tx_links where transaction_id=old.id and user_id=old.user_id;
  return old;
end;
$$;

-- Triggers continuam funcionando sem serem expostos como funções públicas.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature, p.prorettype='trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and left(p.proname,3)='mf_'
  loop
    execute format('alter function %s set search_path=pg_catalog,public,pg_temp',f.signature);
    if f.is_trigger then
      execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    else
      execute format('revoke all on function %s from public,anon',f.signature);
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
  end loop;
end;
$$;
