-- Disposable DB only; legacy fixture + migration required. All test changes roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if (select count(id) from public.push_subscriptions)<>3 then raise exception 'migration did not deduplicate'; end if;
 if exists(select 1 from public.push_subscriptions where endpoint like '%/conflict') then raise exception 'ambiguous endpoint migrated'; end if;
 if not exists(select 1 from public.push_subscriptions where endpoint like '%/shared' and language='es' and p256dh='new-key') then raise exception 'latest subscription not preserved'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ declare n integer; begin
 if exists(select 1 from public.push_subscriptions) or exists(select 1 from public.mf_push_subscriptions) or exists(select 1 from public.health_push_subscriptions) then raise exception 'cross-account read'; end if;
 update public.push_subscriptions set enabled=false;
 get diagnostics n=row_count; if n<>0 then raise exception 'cross-account opt-out'; end if;
 begin
  insert into public.push_subscriptions(endpoint,p256dh,auth) values('https://fcm.googleapis.com/shared','x','x')
  on conflict(endpoint) do update set user_id=excluded.user_id;
  raise exception 'endpoint takeover allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/forged','x','x');
  raise exception 'forged owner allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform id from public.mf_push_subscriptions_legacy; raise exception 'legacy backup exposed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ declare n integer; begin
 select count(id) into n from public.push_subscriptions; if n<>3 then raise exception 'owner lost consent'; end if;
 update public.push_subscriptions set enabled=false where endpoint='https://fcm.googleapis.com/shared';
 select count(id) into n from public.mf_push_subscriptions; if n<>2 then raise exception 'finance ignores global opt-out'; end if;
 select count(id) into n from public.health_push_subscriptions; if n<>2 then raise exception 'health ignores global opt-out'; end if;
 begin
  update public.push_subscriptions set user_id='44444444-4444-4444-8444-444444444444'; raise exception 'ownership transfer allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.health_push_subscriptions(endpoint,p256dh,auth) values('https://fcm.googleapis.com/legacy-opt-in','x','x');
  raise exception 'module-local enrollment still allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare n integer; begin
 select count(id) into n from public.mf_push_subscriptions; if n<>2 then raise exception 'legacy worker bypasses global preference'; end if;
 select count(id) into n from public.health_push_subscriptions; if n<>2 then raise exception 'legacy health worker bypasses global preference'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform id from public.push_subscriptions; raise exception 'anonymous subscriptions exposed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS: migration, deduplication, conflicting owners, global opt-out, RLS, legacy compatibility'
