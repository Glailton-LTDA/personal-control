-- Disposable/local test database only; all records roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('55555555-5555-4555-8555-555555555555'),('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
insert into public.health_appointments(id,name,starts_at,address)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','Original',now()+interval '2 days','Rua de teste, 12');
insert into public.health_appointments(id,name,starts_at,follow_up_of,address)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','Retorno',now()+interval '32 days','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','Rua de teste, 12');
update public.health_appointments set status='completed' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
do $$ begin
 if exists(select 1 from public.health_reminders where appointment_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' and dismissed_at is null) then raise exception 'completed appointment left reminders'; end if;
 if not exists(select 1 from public.health_reminders where appointment_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' and dismissed_at is null) then raise exception 'follow-up did not schedule reminders'; end if;
 begin
  update public.health_appointments set follow_up_of=id where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  raise exception 'self-reference accepted';
 exception when check_violation then null; end;
 begin
  delete from public.health_appointments where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  raise exception 'linked original deleted';
 exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
 if exists(select 1 from public.health_appointments where id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')) then raise exception 'cross-owner read'; end if;
 begin
  insert into public.health_appointments(name,starts_at,follow_up_of) values('Forged',now(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
  raise exception 'cross-owner follow-up accepted';
 exception when foreign_key_violation then null; end;
 update public.health_appointments set status='cancelled',address='forged' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
 if found then raise exception 'cross-owner update'; end if;
end $$;
reset role;
rollback;
\echo 'PASS: follow-up owner FK, self-reference, deletion, RLS, completion and reminder preservation'
