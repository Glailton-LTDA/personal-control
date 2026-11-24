-- Canonical account_ids lives on the existing goal aggregate. account_id remains
-- a compatibility mirror for single-account clients, not a second source of truth.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.mf_goals add column account_ids uuid[];

create or replace function public.mf_validate_goal_accounts() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; n integer; currencies integer;
begin
 if new.account_ids is null then
  ids:=case when new.account_id is null then '{}'::uuid[] else array[new.account_id] end;
 elsif tg_op='UPDATE' then
  if new.account_ids is not distinct from old.account_ids and new.account_id is distinct from old.account_id then
   if cardinality(old.account_ids)>1 then raise exception 'mf_goal_multi_legacy_edit' using errcode='P0001'; end if;
   ids:=case when new.account_id is null then '{}'::uuid[] else array[new.account_id] end;
  else ids:=new.account_ids; end if;
 else ids:=new.account_ids;
 end if;
 if cardinality(ids)>1000 or array_position(ids,null) is not null then
  raise exception 'mf_goal_accounts_invalid' using errcode='P0001';
 end if;
 select coalesce(array_agg(x.id order by x.ord),'{}'::uuid[]) into ids
 from (select id,min(ord) ord from unnest(ids) with ordinality a(id,ord) group by id) x;
 -- Ordered row locks serialize against currency changes and deletion.
 perform a.id from public.mf_accounts a where a.user_id=new.user_id and a.id=any(ids) order by a.id for share;
 select count(*),count(distinct coalesce(nullif(upper(trim(a.currency)),''),'BRL')) into n,currencies
 from public.mf_accounts a where a.user_id=new.user_id and a.id=any(ids);
 if n<>cardinality(ids) then raise exception 'mf_reference_not_authorized' using errcode='P0001'; end if;
 if currencies>1 then raise exception 'mf_goal_accounts_currency' using errcode='P0001'; end if;
 new.account_ids:=ids; new.account_id:=ids[1];
 return new;
end $$;
revoke all on function public.mf_validate_goal_accounts() from public,anon,authenticated;
create trigger a_mf_goal_accounts before insert or update on public.mf_goals
 for each row execute function public.mf_validate_goal_accounts();

-- Preserve all valid legacy links. Invalid cross-owner legacy references cannot
-- be adopted into the new aggregate; detach them without deleting goal history.
update public.mf_goals g set account_ids=case when exists(
 select 1 from public.mf_accounts a where a.id=g.account_id and a.user_id=g.user_id
) then array[g.account_id] else '{}'::uuid[] end;
alter table public.mf_goals alter column account_ids set not null;
create index mf_goals_account_ids on public.mf_goals using gin(account_ids);

create or replace function public.mf_guard_goal_account_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.mf_goals set account_ids=array_remove(account_ids,old.id)
   where user_id=old.user_id and account_ids @> array[old.id];
  return old;
 end if;
 if (new.currency is distinct from old.currency or new.user_id is distinct from old.user_id)
  and exists(select 1 from public.mf_goals where user_id=old.user_id and account_ids @> array[old.id]) then
  raise exception 'mf_goal_account_in_use' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function public.mf_guard_goal_account_change() from public,anon,authenticated;
create trigger a_mf_goal_account_delete before delete on public.mf_accounts
 for each row execute function public.mf_guard_goal_account_change();
create trigger a_mf_goal_account_currency before update of currency,user_id on public.mf_accounts
 for each row execute function public.mf_guard_goal_account_change();

create or replace function public.mf_guard_linked_goal_contribution() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ids uuid[];
begin
 select g.account_ids into ids from public.mf_goals g
  where g.id=new.goal_id and g.user_id=new.user_id for update;
 if not found then raise exception 'mf_reference_not_authorized' using errcode='P0001'; end if;
 if cardinality(ids)>0 then raise exception 'mf_goal_linked_no_contributions' using errcode='P0001'; end if;
 return new;
end $$;
revoke all on function public.mf_guard_linked_goal_contribution() from public,anon,authenticated;
create trigger a_mf_goal_contributions_mode before insert or update on public.mf_goal_contributions
 for each row execute function public.mf_guard_linked_goal_contribution();
-- Keep complete snapshots compatible with linked goals that retain earlier
-- manual history. Existing restore authorization and non-destructive merge stay.
create or replace function public.mf_restore_snapshot(p_point uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid:=auth.uid(); snap jsonb; tbl text; rows jsonb; pk_cols text; update_cols text;
  goal_rows jsonb; all_columns text; row_columns text; goal_row jsonb; restored_ids uuid[];
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
  goal_rows:=snap->'tables'->'mf_goals';
  -- Restore goal history while the affected goals are temporarily manual in
  -- this transaction. No trigger bypass or client-controlled session flag.
  update public.mf_goals g set account_ids='{}'::uuid[]
   where g.user_id=uid and exists(select 1 from jsonb_array_elements(goal_rows) r where r->>'id'=g.id::text);
  foreach tbl in array mf_private.snapshot_tables() loop
    rows:=snap->'tables'->tbl;
    if tbl='mf_goals' then
      select coalesce(jsonb_agg(r||jsonb_build_object('account_id',null,'account_ids','[]'::jsonb)),'[]'::jsonb) into rows
       from jsonb_array_elements(rows) r;
    end if;
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
    select string_agg(format('%I',a.attname),',' order by a.attnum),
           string_agg(format('r.%I',a.attname),',' order by a.attnum)
      into all_columns,row_columns from pg_attribute a
      where a.attrelid=format('public.%I',tbl)::regclass and a.attnum>0
       and not a.attisdropped and a.attgenerated='';
    -- Non-destructive merge with explicit generated column lists.
    execute format('insert into public.%I as target (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) r where not exists(select 1 from public.%I t where %s and to_jsonb(t)=to_jsonb(r)) on conflict (%s) %s',tbl,all_columns,row_columns,tbl,tbl,join_sql,conflict_cols,conflict_action)
      using rows,uid;
  end loop;
  for goal_row in select r from jsonb_array_elements(goal_rows) r loop
    if jsonb_typeof(goal_row->'account_ids')='array' then
      select coalesce(array_agg(id::uuid),'{}'::uuid[]) into restored_ids
       from jsonb_array_elements_text(goal_row->'account_ids') id;
    else restored_ids:=case when goal_row->>'account_id' is null then '{}'::uuid[] else array[(goal_row->>'account_id')::uuid] end;
    end if;
    update public.mf_goals set account_ids=restored_ids where id=(goal_row->>'id')::uuid and user_id=uid;
  end loop;
  return safety_id;
end;
$$;

revoke all on function public.mf_restore_snapshot(uuid) from public,anon;
grant execute on function public.mf_restore_snapshot(uuid) to authenticated;

commit;
