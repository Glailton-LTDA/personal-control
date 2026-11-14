-- Treatment scheduling RPCs: validation, revisions, doses, history, DST, RLS.
-- Run as postgres after 20261113120000_medication_treatments.sql. Always rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
create temporary table med_ctx(k text primary key, v text);
grant all on med_ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

-- F01/F02: create an interval treatment through the canonical RPC.
do $$ declare res jsonb; med uuid; n integer; d jsonb;
begin
 res:=public.health_treatment_save(jsonb_build_object(
  'name','Teste intervalo','dose','1 comprimido','mode','interval',
  'timezone','America/Sao_Paulo','duration_kind','continuous',
  'anchor_date',to_char((now() at time zone 'America/Sao_Paulo')::date-1,'YYYY-MM-DD'),
  'anchor_time','08:00','interval_minutes',300,'reminders_enabled',true),
  'aaaaaaaa-0000-4000-8000-000000000001');
 med:=(res->>'id')::uuid;
 if (res->>'revision')::int<>1 then raise exception 'first revision expected'; end if;
 if (res->>'row_version')::bigint<>0 then raise exception 'new row_version expected 0'; end if;
 if jsonb_array_length(res->'next_occurrences')<1 then raise exception 'no next occurrences'; end if;
 insert into med_ctx values('med',med::text),('version','0');
 select count(*) into n from public.health_medication_schedules
  where medication_id=med and mode='interval' and interval_minutes=300;
 if n<>1 then raise exception 'interval revision missing'; end if;
 select count(*) into n from public.health_medication_occurrences
  where medication_id=med and canceled_at is null;
 if n<1 then raise exception 'occurrences not materialized'; end if;
 d:=public.health_treatment_detail(med);
 if d->'schedule'->>'mode'<>'interval' then raise exception 'detail mode'; end if;
 if (d->'stats'->>'total_predicted') is not null then raise exception 'continuous total must be null'; end if;
 if jsonb_array_length(d->'next')<1 then raise exception 'detail next empty'; end if;
 d:=public.health_treatment_list('active','teste',20,0);
 if jsonb_array_length(d->'rows')<>1 then raise exception 'list row count'; end if;
 if (d->'rows'->0->'today'->>'planned')::int<1 then raise exception 'today planned'; end if;
 d:=public.health_treatment_calendar(med,
  (now() at time zone 'America/Sao_Paulo')::date-1,
  (now() at time zone 'America/Sao_Paulo')::date+1);
 if (d->>'slots')::int<1 then raise exception 'calendar empty'; end if;
 d:=public.health_treatment_history(med,'all',null,null,20);
 if jsonb_array_length(d->'rows')<1 then raise exception 'history empty'; end if;
 if d->'rows'->0->>'status' is null then raise exception 'history status'; end if;
end $$;

-- Record, idempotent replay, payload conflict, version conflict, undo and audit.
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med'); slot timestamptz;
 res jsonb; n integer; v text;
begin
 select scheduled_at into slot from health_private.schedule_slots(
  '11111111-1111-4111-8111-111111111111',med,now()-interval '2 days',now())
  order by scheduled_at desc limit 1;
 if slot is null then raise exception 'no past slot for dose'; end if;
 insert into med_ctx values('slot',slot::text);
 res:=public.health_dose_record(med,slot,'taken',slot,'1 comprimido','',0,
  'aaaaaaaa-0000-4000-8000-000000000010');
 if (res->>'row_version')::bigint<>1 then raise exception 'dose version'; end if;
 v:=res::text;
 res:=public.health_dose_record(med,slot,'taken',slot,'1 comprimido','',0,
  'aaaaaaaa-0000-4000-8000-000000000010');
 if res::text<>v then raise exception 'idempotent replay differs'; end if;
 begin
  perform public.health_dose_record(med,slot,'taken',slot,'2 comprimidos','',0,
   'aaaaaaaa-0000-4000-8000-000000000010');
  raise exception 'idempotency conflict accepted';
 exception when others then
  if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if;
 end;
 res:=public.health_dose_record(med,slot,'skipped',null,'','',1,
  'aaaaaaaa-0000-4000-8000-000000000015');
 if (res->>'row_version')::bigint<>2 then raise exception 'dose update version'; end if;
 begin
  perform public.health_dose_record(med,slot,'taken',slot,'','',0,
   'aaaaaaaa-0000-4000-8000-000000000011');
  raise exception 'stale version accepted';
 exception when others then
  if sqlerrm<>'VERSION_CONFLICT' then raise; end if;
 end;
 begin
  perform public.health_dose_undo(med,slot,0,'aaaaaaaa-0000-4000-8000-000000000012');
  raise exception 'undo stale version accepted';
 exception when others then
  if sqlerrm<>'VERSION_CONFLICT' then raise; end if;
 end;
 res:=public.health_dose_undo(med,slot,2,'aaaaaaaa-0000-4000-8000-000000000013');
 if not (res->>'undone')::boolean then raise exception 'undo failed'; end if;
 select count(*) into n from public.health_doses where medication_id=med and scheduled_at=slot;
 if n<>0 then raise exception 'undo left projection'; end if;
 select count(*) into n from public.health_dose_events
  where medication_id=med and scheduled_at=slot and action='undone';
 if n<>1 then raise exception 'undo not audited'; end if;
 res:=public.health_dose_undo(med,slot,2,'aaaaaaaa-0000-4000-8000-000000000013');
 if not (res->>'undone')::boolean then raise exception 'undo replay failed'; end if;
 perform public.health_dose_record(med,slot,'taken',slot,'1 comprimido','',0,
  'aaaaaaaa-0000-4000-8000-000000000014');
end $$;

-- T01: edit creates a new immutable revision and keeps history.
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med'); res jsonb; n integer;
begin
 res:=public.health_treatment_save(jsonb_build_object(
  'id',med,'expected_version',0,'name','Teste diario','dose','1 comprimido',
  'mode','daily_times','timezone','America/Sao_Paulo','duration_kind','continuous',
  'local_start_date',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD'),
  'local_times',jsonb_build_array('09:00','21:00'),'reminders_enabled',true),
  'aaaaaaaa-0000-4000-8000-000000000020');
 if (res->>'revision')::int<>2 then raise exception 'revision 2 expected'; end if;
 if (res->>'row_version')::bigint<>1 then raise exception 'edit version'; end if;
 insert into med_ctx values('version','1') on conflict (k) do update set v=excluded.v;
 select count(*) into n from public.health_medication_schedules where medication_id=med;
 if n<>2 then raise exception 'revision not appended'; end if;
 select count(*) into n from public.health_medication_schedules
  where medication_id=med and effective_until is null;
 if n<>1 then raise exception 'open revisions must be exactly one'; end if;
 res:=public.health_treatment_save(jsonb_build_object(
  'id',med,'expected_version',0,'name','Teste diario','dose','1 comprimido',
  'mode','daily_times','timezone','America/Sao_Paulo','duration_kind','continuous',
  'local_start_date',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD'),
  'local_times',jsonb_build_array('09:00','21:00'),'reminders_enabled',true),
  'aaaaaaaa-0000-4000-8000-000000000021');
 raise exception 'stale edit accepted';
exception when others then
 if sqlerrm<>'VERSION_CONFLICT' then raise; end if;
end $$;

-- Pause closes the revision, resume recreates it and reactivates planned slots.
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med'); res jsonb; n integer; ver bigint;
begin
 select row_version into ver from public.health_medications where id=med;
 begin
  perform public.health_treatment_state(med,'pause',null,ver-1,'',
   'aaaaaaaa-0000-4000-8000-000000000029');
  raise exception 'stale pause accepted';
 exception when others then
  if sqlerrm<>'VERSION_CONFLICT' then raise; end if;
 end;
 res:=public.health_treatment_state(med,'pause',now()+interval '1 second',ver,'',
  'aaaaaaaa-0000-4000-8000-000000000030');
 if res->>'status'<>'paused' then raise exception 'pause status'; end if;
 if (res->>'canceled_occurrences')::int<1 then raise exception 'pause did not cancel'; end if;
 select count(*) into n from public.health_medication_schedules
  where medication_id=med and effective_until is null;
 if n<>0 then raise exception 'pause left open revision'; end if;
 res:=public.health_treatment_state(med,'resume',now()+interval '2 seconds',
  (res->>'row_version')::bigint,'','aaaaaaaa-0000-4000-8000-000000000031');
 if res->>'status'<>'active' then raise exception 'resume status'; end if;
 select count(*) into n from public.health_medication_occurrences
  where medication_id=med and canceled_at is not null
   and cancellation_reason='paused' and scheduled_at>=now();
 if n<>0 then raise exception 'resume left paused cancellations'; end if;
 select count(*) into n from public.health_medication_schedules
  where medication_id=med and effective_until is null;
 if n<>1 then raise exception 'resume open revision'; end if;
 insert into med_ctx values('version',(res->>'row_version')) on conflict (k) do update set v=excluded.v;
end $$;

-- Finish closes at the cut and moves the card to the finished list.
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med'); res jsonb; n integer; ver bigint;
begin
 select row_version into ver from public.health_medications where id=med;
 res:=public.health_treatment_state(med,'finish',now()+interval '3 seconds',ver,
  'Concluido pelo teste','aaaaaaaa-0000-4000-8000-000000000040');
 if res->>'status'<>'finished' then raise exception 'finish status'; end if;
 if (res->>'canceled_occurrences')::int<1 then raise exception 'finish did not cancel'; end if;
 select count(*) into n from jsonb_array_elements(
  public.health_treatment_list('active','',20,0)->'rows') e
  where e->>'id'=med::text;
 if n<>0 then raise exception 'finished in active list'; end if;
 select count(*) into n from jsonb_array_elements(
  public.health_treatment_list('finished','',20,0)->'rows') e
  where e->>'id'=med::text;
 if n<>1 then raise exception 'finished list missing'; end if;
 if not exists(select 1 from public.health_medications where id=med
   and finished_at is not null and finish_reason='Concluido pelo teste') then
  raise exception 'finish metadata';
 end if;
 begin
  perform public.health_treatment_state(med,'resume',now()+interval '4 seconds',
   (res->>'row_version')::bigint,'','aaaaaaaa-0000-4000-8000-000000000041');
  raise exception 'resume after finish accepted';
 exception when others then
  if sqlerrm<>'INVALID_SCHEDULE' then raise; end if;
 end;
end $$;

-- DST: 02:30 does not exist on 2027-03-14 in New York, so it is omitted.
do $$ declare res jsonb; med uuid; total int;
begin
 res:=public.health_treatment_save(jsonb_build_object(
  'name','Teste DST','dose','1','mode','daily_times','timezone','America/New_York',
  'duration_kind','finite','duration_days',3,
  'local_start_date','2027-03-13','local_times',jsonb_build_array('02:30'),
  'reminders_enabled',false),
  'aaaaaaaa-0000-4000-8000-000000000050');
 med:=(res->>'id')::uuid;
 select health_private.revision_total(id) into total
  from public.health_medication_schedules where medication_id=med;
 if total<>2 then raise exception 'DST total expected 2, got %',total; end if;
end $$;

-- Calendar bounds and invalid inputs.
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med');
begin
 begin
  perform public.health_treatment_calendar(med,current_date,current_date+42);
  raise exception 'oversized calendar accepted';
 exception when others then
  if sqlerrm<>'WINDOW_TOO_LARGE' then raise; end if;
 end;
 begin
  perform public.health_treatment_save(jsonb_build_object(
   'name','Bad tz','dose','1','mode','interval','timezone','Mars/Olympus',
   'duration_kind','continuous','anchor_date','2026-01-01','anchor_time','08:00',
   'interval_minutes',60),'aaaaaaaa-0000-4000-8000-000000000060');
  raise exception 'invalid timezone accepted';
 exception when others then
  if sqlerrm<>'INVALID_TIMEZONE' then raise; end if;
 end;
 begin
  perform public.health_treatment_save(jsonb_build_object(
   'name','Bad interval','dose','1','mode','interval','timezone','UTC',
   'duration_kind','continuous','anchor_date','2026-01-01','anchor_time','08:00',
   'interval_minutes',30),'aaaaaaaa-0000-4000-8000-000000000061');
  raise exception 'invalid interval accepted';
 exception when others then
  if sqlerrm<>'INVALID_INTERVAL' then raise; end if;
 end;
 begin
  perform public.health_treatment_save(jsonb_build_object(
   'name','Bad duration','dose','1','mode','daily_times','timezone','UTC',
   'duration_kind','finite','duration_days',366,'local_start_date','2026-01-01',
   'local_times',jsonb_build_array('08:00')),'aaaaaaaa-0000-4000-8000-000000000062');
  raise exception 'invalid duration accepted';
 exception when others then
  if sqlerrm<>'INVALID_DURATION' then raise; end if;
 end;
end $$;

-- Legacy client insert is bridged into a revision; empty legacy times stay pending.
do $$ declare med uuid:='aaaaaaaa-0000-4000-8000-000000000070'; n int;
begin
 insert into public.health_medications(id,name,dose,starts_on,times,timezone)
 values(med,'Legacy','1',current_date,array['09:00'::time,'21:00'::time],'America/Sao_Paulo');
 select count(*) into n from public.health_medication_schedules where medication_id=med;
 if n<>1 then raise exception 'legacy bridge missing'; end if;
 if (select schedule_pending from public.health_medications where id=med) then
  raise exception 'legacy bridge left pending';
 end if;
 insert into public.health_medications(id,name,dose,starts_on,times,timezone,reminders_enabled)
 values('aaaaaaaa-0000-4000-8000-000000000071','Legacy pending','1',current_date,'{}','UTC',false);
 if not (select schedule_pending from public.health_medications
   where id='aaaaaaaa-0000-4000-8000-000000000071') then
  raise exception 'empty legacy schedule not pending';
 end if;
end $$;

-- Second user and anonymous cannot read or mutate first owner's treatment.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare med uuid:=(select v::uuid from med_ctx where k='med'); slot timestamptz;
begin
 begin
  perform public.health_treatment_detail(med); raise exception 'cross-owner detail';
 exception when others then
  if sqlerrm<>'NOT_FOUND_OR_FORBIDDEN' then raise; end if;
 end;
 begin
  perform public.health_treatment_state(med,'pause',null,0,'','aaaaaaaa-0000-4000-8000-000000000080');
  raise exception 'cross-owner state';
 exception when others then
  if sqlerrm<>'NOT_FOUND_OR_FORBIDDEN' then raise; end if;
 end;
 begin
  perform public.health_dose_record(med,now()-interval '1 hour','taken',now(),'','',0,
   'aaaaaaaa-0000-4000-8000-000000000081');
  raise exception 'cross-owner dose';
 exception when others then
  if sqlerrm not in ('NOT_FOUND_OR_FORBIDDEN','OCCURRENCE_NOT_SCHEDULED') then raise; end if;
 end;
 if jsonb_array_length((public.health_treatment_list('all','',20,0))->'rows')<>0 then
  raise exception 'cross-owner list leak';
 end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform public.health_treatment_list('active','',20,0);
  raise exception 'anonymous list allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.health_treatment_save('{}'::jsonb,null);
  raise exception 'anonymous save allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.health_medication_schedules;
  raise exception 'anonymous schedule read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Time-resolution parity checks (scheduler-owned helper).
do $$ declare v timestamptz;
begin
 if health_private.local_instant('2027-03-14'::date,'02:30'::time,'America/New_York') is not null then
  raise exception 'nonexistent local time was not omitted';
 end if;
 v:=health_private.local_instant('2027-11-07'::date,'01:30'::time,'America/New_York');
 if v<>'2027-11-07 05:30:00+00'::timestamptz then
  raise exception 'ambiguous local time did not pick earlier offset: %',v;
 end if;
end $$;

rollback;
\echo 'PASS: treatments, revisions, doses, history, DST, bounds, legacy bridge, RLS'
