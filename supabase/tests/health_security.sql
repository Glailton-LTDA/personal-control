-- Run as postgres against a disposable DB after the health and global push migrations. Always rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
-- Simulate an old permissive storage policy: restrictive guide guard must win.
create policy health_test_legacy_open on storage.objects for all to authenticated using(true) with check(true);
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.health_conditions(id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Condition A');
insert into public.health_appointments(id,name,starts_at,condition_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Appointment A',now()+interval '4 days','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
insert into public.health_medications(id,name,dose,starts_on,times,timezone,condition_id,appointment_id)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','Medicine A','1 unit',current_date,array['09:00'::time,'21:00'::time],'America/Sao_Paulo','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
insert into public.health_exams(id,name,status,performed_at,condition_id,appointment_id,report)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','Exam A','scheduled',now()+interval '3 days','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Private report');
insert into public.health_results(id,exam_id,name,value,unit) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','Result A','10','unit');
insert into public.health_documents(id,name,category,mime_type,size_bytes,storage_path,exam_id)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','Report.pdf','report','application/pdf',20,'11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
insert into storage.objects(bucket_id,name) values('health-documents','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6.pdf');
insert into public.push_subscriptions(endpoint,p256dh,auth) values('https://fcm.googleapis.com/test-a','key','auth');
select public.health_refresh_reminders();
-- Assert trigger output, ownership transfer denial, duplicate protection and snooze semantics.
do $$ declare before_at timestamptz; after_at timestamptz; reminder_id uuid; n integer;
begin
 select count(id) into n from public.health_reminders where medication_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
 if n<20 then raise exception 'dose scheduling failed'; end if;
 select id,scheduled_at into reminder_id,before_at from public.health_reminders where medication_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' order by scheduled_at limit 1;
 update public.health_reminders set remind_at=now()+interval '10 minutes' where id=reminder_id;
 select scheduled_at into after_at from public.health_reminders where id=reminder_id;
 if before_at<>after_at then raise exception 'snooze changed scheduled time'; end if;
 insert into public.health_doses(medication_id,scheduled_at,taken_at,status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',before_at,now(),'taken');
 if exists(select 1 from public.health_reminders where id=reminder_id and dismissed_at is null) then raise exception 'dose did not dismiss reminder'; end if;
 begin
  insert into public.health_doses(medication_id,scheduled_at,taken_at,status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',before_at,now(),'taken');
  raise exception 'duplicate dose accepted';
 exception when unique_violation then null; end;
 begin
  update public.health_conditions set user_id='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  raise exception 'ownership transfer allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.health_claim_reminders(); raise exception 'client can claim server queue';
 exception when insufficient_privilege then null; end;
 begin
  update public.health_reminders set delivered_at=now(); raise exception 'client can alter delivery state';
 exception when insufficient_privilege then null; end;
 select count(id) into n from storage.objects where bucket_id='health-documents';
 if n<>1 then raise exception 'owner cannot read document'; end if;
 update public.health_reminders set remind_at=now()-interval '1 minute' where id=(select id from public.health_reminders where appointment_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' order by remind_at limit 1);
 update public.health_medications set status='finished' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
 if exists(select 1 from public.health_reminders where medication_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' and dismissed_at is null) then raise exception 'finished treatment left reminders'; end if;
end $$;
-- Second authenticated user cannot read/write/delete first owner's records.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare t text; n integer;
begin
 perform public.health_refresh_reminders();
 foreach t in array array['conditions','appointments','medications','exams','results','documents','doses','reminders','push_subscriptions'] loop
  execute format('select count(id) from public.health_%I',t) into n;
  if n<>0 then raise exception 'cross-owner read in %',t; end if;
 end loop;
 select count(id) into n from storage.objects where bucket_id='health-documents';
 if n<>0 then raise exception 'cross-owner storage read'; end if;
 delete from storage.objects where bucket_id='health-documents';
 get diagnostics n=row_count; if n<>0 then raise exception 'cross-owner storage delete'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('health-documents','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6.pdf');
  raise exception 'cross-owner storage upload allowed';
 exception when insufficient_privilege then null; end;
 update public.health_exams set report='hacked' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
 get diagnostics n=row_count; if n<>0 then raise exception 'cross-owner update'; end if;
 delete from public.health_exams where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
 get diagnostics n=row_count; if n<>0 then raise exception 'cross-owner delete'; end if;
 begin
  insert into public.health_conditions(user_id,name) values('11111111-1111-4111-8111-111111111111','forged');
  raise exception 'forged owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.health_appointments(name,starts_at,condition_id) values('Cross-link',now(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  raise exception 'cross-owner condition link accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.health_medications(name,dose,starts_on,times,timezone,appointment_id) values('Cross-link','1',current_date,array['09:00'::time],'UTC','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  raise exception 'cross-owner appointment link accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.health_results(exam_id,name,value) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','Cross-result','10');
  raise exception 'cross-owner result link accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.health_doses(medication_id,scheduled_at,taken_at,status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',now(),now(),'taken');
  raise exception 'cross-owner dose link accepted';
 exception when foreign_key_violation then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare t text;
begin
 begin
  perform public.health_refresh_reminders(); raise exception 'anonymous refresh allowed';
 exception when insufficient_privilege then null; end;
 foreach t in array array['conditions','appointments','medications','exams','results','documents','doses','reminders','push_subscriptions'] loop
  begin
   execute format('select id from public.health_%I limit 1',t);
   raise exception 'anonymous table access allowed: %',t;
  exception when insufficient_privilege then null; end;
 end loop;
 if exists(select 1 from storage.objects where bucket_id='health-documents') then raise exception 'anonymous storage access'; end if;
end $$;
reset role;
set local role service_role;
select public.health_prepare_reminders();
do $$ declare n integer; begin
 select count(id) into n from public.health_claim_reminders();
 if n<>1 then raise exception 'claim did not lease one due reminder'; end if;
 select count(id) into n from public.health_claim_reminders();
 if n<>0 then raise exception 'concurrent claim could redeliver same reminder'; end if;
 update public.health_reminders set delivered_at=now() where remind_at<now() and appointment_id is not null;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare target uuid; begin
 select id into target from public.health_reminders where delivered_at is not null limit 1;
 update public.health_reminders set remind_at=now()+interval '10 minutes' where id=target;
 if exists(select 1 from public.health_reminders where id=target and (delivered_at is not null or claimed_until is not null)) then raise exception 'snooze did not reset delivery'; end if;
 update public.health_appointments set status='cancelled' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
 if exists(select 1 from public.health_reminders where appointment_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' and dismissed_at is null) then raise exception 'cancelled appointment left reminders'; end if;
 update public.health_exams set performed_at=now()+interval '10 days' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
 if exists(select 1 from public.health_reminders where exam_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' and scheduled_at<now()+interval '9 days' and dismissed_at is null) then raise exception 'rescheduled exam left old reminders'; end if;
end $$;
reset role;
rollback;
\echo 'PASS: owner, cross-owner, anonymous, storage, FK, doses, queue, snooze, cancellation'
