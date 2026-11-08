set lock_timeout='5s';
set statement_timeout='60s';

-- Lista fechada: não aceitar nomes de tabelas enviados pelo cliente.
create or replace function mf_private.snapshot_tables()
returns text[] language sql immutable set search_path=pg_catalog
as $$ select array['mf_profiles','mf_account_types','mf_account_groups','mf_accounts','mf_categories','mf_tags','mf_responsibles','mf_transactions','mf_transaction_tags','mf_budgets','mf_goals','mf_goal_contributions','mf_saved_reports','mf_card_settings','mf_invoices','mf_tx_links','mf_import_batches','mf_import_rows','mf_invoice_notifications','mf_user_prefs']::text[] $$;

create or replace function mf_private.snapshot_data()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare uid uuid:=auth.uid(); tbl text; rows jsonb; data jsonb:='{}'; counts jsonb:='{}';
begin
  if uid is null then raise exception 'mf_auth_required' using errcode='42501'; end if;
  foreach tbl in array mf_private.snapshot_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where user_id=$1',tbl) into rows using uid;
    data:=data||jsonb_build_object(tbl,rows);
    counts:=counts||jsonb_build_object(tbl,jsonb_array_length(rows));
  end loop;
  return jsonb_build_object('format_version',2,'complete',true,'tables',data,'counts',counts);
end;
$$;

create or replace function public.mf_create_restore_point(p_label text)
returns public.mf_restore_points language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare point public.mf_restore_points;
begin
  if auth.uid() is null then raise exception 'mf_auth_required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_label,''))) not between 1 and 200 then raise exception 'mf_invalid_label'; end if;
  insert into public.mf_restore_points(user_id,label,payload)
    values(auth.uid(),btrim(p_label),mf_private.snapshot_data()) returning * into point;
  return point;
end;
$$;

create or replace function public.mf_restore_snapshot(p_point uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid:=auth.uid(); snap jsonb; tbl text; rows jsonb; pk_cols text; update_cols text;
  join_sql text; foreign_row boolean; safety_id uuid; conflict_cols text; conflict_action text;
begin
  if uid is null then raise exception 'mf_auth_required' using errcode='42501'; end if;
  -- Serializar restaurações por usuário. Nenhum lock de tabela longo.
  perform pg_advisory_xact_lock(hashtextextended('mf_restore:'||uid::text,0));
  select payload into snap from public.mf_restore_points where id=p_point and user_id=uid;
  if not found then raise exception 'mf_restore_not_found' using errcode='42501'; end if;
  if snap->>'format_version' is distinct from '2' or snap->>'complete' is distinct from 'true' then
    raise exception 'mf_legacy_snapshot_requires_review';
  end if;
  foreach tbl in array mf_private.snapshot_tables() loop
    rows:=snap->'tables'->tbl;
    if jsonb_typeof(rows) is distinct from 'array' or
       (snap->'counts'->>tbl)::integer is distinct from jsonb_array_length(rows) then
      raise exception 'mf_incomplete_snapshot';
    end if;
    if exists(select 1 from jsonb_array_elements(rows) r where r->>'user_id' is distinct from uid::text) then
      raise exception 'mf_restore_owner_mismatch' using errcode='42501';
    end if;
  end loop;
  -- Não reescrever integrações externas por restauração de outro módulo.
  -- Diferenças em lançamentos vinculados exigem revisão, com rollback integral.
  if exists (
    select 1 from public.mf_tx_links l
    join public.mf_transactions t on t.id=l.transaction_id and t.user_id=uid
    where l.user_id=uid and (
      not exists(select 1 from jsonb_array_elements(snap->'tables'->'mf_transactions') r where r->>'id'=t.id::text and r=to_jsonb(t))
      or not exists(select 1 from jsonb_array_elements(snap->'tables'->'mf_tx_links') r where r->>'transaction_id'=l.transaction_id::text and r=to_jsonb(l))
    )
  ) or exists (
    select 1 from jsonb_array_elements(snap->'tables'->'mf_tx_links') r
    where not exists(select 1 from public.mf_tx_links l where l.transaction_id=(r->>'transaction_id')::uuid and l.user_id=uid and to_jsonb(l)=r)
  ) then raise exception 'mf_restore_linked_changes_require_review'; end if;

  insert into public.mf_restore_points(user_id,label,payload)
    values(uid,'Backup automático antes da restauração',mf_private.snapshot_data()) returning id into safety_id;
  foreach tbl in array mf_private.snapshot_tables() loop
    rows:=snap->'tables'->tbl;
    if jsonb_array_length(rows)=0 then continue; end if;
    select string_agg(format('%I',a.attname),',' order by k.ord),
           string_agg(format('t.%I=r.%I',a.attname,a.attname),' and ' order by k.ord)
      into pk_cols,join_sql
      from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
      where c.conrelid=format('public.%I',tbl)::regclass and c.contype='p';
    if pk_cols is null then raise exception 'mf_snapshot_table_without_pk'; end if;
    execute format('select exists(select 1 from public.%I t join jsonb_populate_recordset(null::public.%I,$1) r on %s where t.user_id<>$2)',tbl,tbl,join_sql)
      into foreign_row using rows,uid;
    if foreign_row then raise exception 'mf_restore_owner_mismatch' using errcode='42501'; end if;
    select string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum) into update_cols
      from pg_attribute a where a.attrelid=format('public.%I',tbl)::regclass and a.attnum>0 and not a.attisdropped
        and a.attgenerated='' and a.attname not in ('id','user_id','created_at','transaction_id','tag_id');
    conflict_cols:=case tbl when 'mf_card_settings' then 'card_id,effective_from' when 'mf_invoices' then 'card_id,close_date' else pk_cols end;
    conflict_action:=case when update_cols is null then 'do nothing' else 'do update set '||update_cols||' where target.user_id=$2' end;
    -- Merge não destrutivo. Registros criados depois do ponto são preservados.
    execute format('insert into public.%I as target select r.* from jsonb_populate_recordset(null::public.%I,$1) r where not exists(select 1 from public.%I t where %s and to_jsonb(t)=to_jsonb(r)) on conflict (%s) %s',tbl,tbl,tbl,join_sql,conflict_cols,conflict_action)
      using rows,uid;
  end loop;
  return safety_id;
end;
$$;

revoke insert,update on public.mf_restore_points from public,anon,authenticated;
revoke all on function public.mf_create_restore_point(text),public.mf_restore_snapshot(uuid) from public,anon;
grant execute on function public.mf_create_restore_point(text),public.mf_restore_snapshot(uuid) to authenticated;
revoke all on function mf_private.snapshot_tables(),mf_private.snapshot_data() from public,anon,authenticated;

create table public.mf_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  minute_start timestamptz not null,
  minute_count integer not null,
  day_count integer not null,
  primary key(user_id,usage_day)
);
alter table public.mf_ai_usage enable row level security;
revoke all on public.mf_ai_usage from public,anon,authenticated;
create or replace function public.mf_consume_ai_budget()
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare uid uuid:=auth.uid(); minute_now timestamptz:=date_trunc('minute',clock_timestamp());
begin
  if uid is null then raise exception 'mf_auth_required' using errcode='42501'; end if;
  insert into public.mf_ai_usage as u(user_id,usage_day,minute_start,minute_count,day_count)
    values(uid,(clock_timestamp() at time zone 'UTC')::date,minute_now,1,1)
    on conflict(user_id,usage_day) do update set
      minute_start=minute_now,
      minute_count=case when u.minute_start=minute_now then u.minute_count+1 else 1 end,
      day_count=u.day_count+1
    where u.day_count<100 and (u.minute_start<>minute_now or u.minute_count<10);
  return found;
end;
$$;
revoke all on function public.mf_consume_ai_budget() from public,anon;
grant execute on function public.mf_consume_ai_budget() to authenticated;

create or replace function public.mf_read_snapshot()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp
as $$ select mf_private.snapshot_data() $$;
revoke all on function public.mf_read_snapshot() from public,anon;
grant execute on function public.mf_read_snapshot() to authenticated;
