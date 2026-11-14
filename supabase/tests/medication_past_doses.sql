-- Disposable PostgreSQL fixtures only; everything rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare payload jsonb; res jsonb; again jsonb; med uuid; slot timestamptz;
 request uuid:=gen_random_uuid(); n integer; dose_version bigint; seen integer;
begin
 payload:=jsonb_build_object('name','Retroactive synthetic','dose','1 tablet',
  'mode','interval','timezone','America/Fortaleza','anchor_date',
  ((now() at time zone 'America/Fortaleza')::date-2)::text,'anchor_time','06:00',
  'interval_minutes',480,'duration_kind','continuous','reminders_enabled',true,
  'mark_past_doses_taken',true);
 res:=public.health_treatment_save(payload,request); med:=(res->>'id')::uuid;
 select count(*) into n from health_private.schedule_slots(
  '33333333-3333-4333-8333-333333333333',med,now()-interval '3 days',now());
 if n<6 or (res->>'past_doses_recorded')::int<>n then raise exception 'wrong import count'; end if;
 if (select count(*) from health_doses where medication_id=med)<>n then raise exception 'missing doses'; end if;
 if exists(select 1 from health_doses where medication_id=med and
   (status<>'taken' or taken_at<>scheduled_at or scheduled_at>=now() or reason<>'retroactive_at_creation')) then
  raise exception 'bad retrospective dose';
 end if;
 if (select count(*) from health_dose_events where medication_id=med and request_id=request
   and actor_user_id='33333333-3333-4333-8333-333333333333' and action='taken')<>n then
  raise exception 'audit missing';
 end if;
 if exists(select 1 from health_reminders r join health_doses d
   on d.medication_id=r.medication_id and d.scheduled_at=r.scheduled_at where r.medication_id=med and r.dismissed_at is null) then
  raise exception 'past reminder generated';
 end if;
 again:=public.health_treatment_save(payload,request);
 if again<>res or (select count(*) from health_doses where medication_id=med)<>n then
  raise exception 'retry duplicated doses';
 end if;
 if public.health_treatment_history(med,'taken')->'rows'->0->>'reason'<>'retroactive_at_creation' then
  raise exception 'history lost origin';
 end if;
 select scheduled_at,row_version into slot,dose_version from health_doses where medication_id=med order by scheduled_at limit 1;
 perform public.health_dose_undo(med,slot,dose_version,gen_random_uuid());
 if exists(select 1 from health_doses where medication_id=med and scheduled_at=slot) then raise exception 'undo failed'; end if;
 -- Editing cannot bulk change history, even with a fresh command ID.
 begin
  perform public.health_treatment_save(payload||jsonb_build_object('id',med,'expected_version',0),gen_random_uuid());
  raise exception 'edit import accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_SCHEDULE' then raise; end if; end;
 -- An unselected option keeps historical doses pending.
 res:=public.health_treatment_save(payload-'mark_past_doses_taken',gen_random_uuid());
 if (res->>'past_doses_recorded')::int<>0 or exists(select 1 from health_doses where medication_id=(res->>'id')::uuid) then
  raise exception 'default marked doses';
 end if;
 -- Expired finite treatment stops at exclusive end, not registration time.
 res:=public.health_treatment_save(payload||jsonb_build_object('duration_kind','finite','duration_days',1),gen_random_uuid());
 if (res->>'past_doses_recorded')::int<>3 then raise exception 'finite boundary'; end if;
 -- No future doses, even if a caller forces the flag for a future start.
 res:=public.health_treatment_save(payload||jsonb_build_object('anchor_date',(current_date+3)::text),gen_random_uuid());
 if (res->>'past_doses_recorded')::int<>0 then raise exception 'future imported'; end if;
 -- Fixed local times use the same engine, including DST gap omission.
 res:=public.health_treatment_save(jsonb_build_object('name','DST synthetic','dose','1',
  'mode','daily_times','timezone','America/New_York','local_start_date','2026-03-08',
  'local_times',jsonb_build_array('02:30','08:00'),'duration_kind','finite','duration_days',1,
  'reminders_enabled',false,'mark_past_doses_taken',true),gen_random_uuid());
 if (res->>'past_doses_recorded')::int<>1 then raise exception 'DST import'; end if;
 -- Oversized requests roll back the medication, occurrences, doses and command.
 select count(*) into seen from health_medications;
 begin
  perform public.health_treatment_save(payload||jsonb_build_object('anchor_date',(current_date-420)::text,'interval_minutes',60),gen_random_uuid());
  raise exception 'oversized import accepted';
 exception when raise_exception then if sqlerrm<>'WINDOW_TOO_LARGE' then raise; end if; end;
 if (select count(*) from health_medications)<>seen then raise exception 'partial oversized save'; end if;
 begin
  perform public.health_treatment_save(payload||jsonb_build_object('anchor_date',(current_date-4000)::text),gen_random_uuid());
  raise exception 'unbounded range accepted';
 exception when raise_exception then if sqlerrm<>'WINDOW_TOO_LARGE' then raise; end if; end;
 begin
  perform public.health_treatment_save(payload||jsonb_build_object('mark_past_doses_taken','yes'),gen_random_uuid());
  raise exception 'nonboolean accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_SCHEDULE' then raise; end if; end;
 -- A different owner sees nothing and cannot edit the imported treatment.
 perform set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
 if exists(select 1 from health_doses where medication_id=med) or exists(select 1 from health_dose_events where medication_id=med) then
  raise exception 'cross owner leak';
 end if;
 begin
  perform public.health_treatment_save(payload||jsonb_build_object('id',med),gen_random_uuid());
  raise exception 'cross owner update accepted';
 exception when raise_exception then if sqlerrm<>'NOT_FOUND_OR_FORBIDDEN' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.health_treatment_save(payload,gen_random_uuid());
  raise exception 'unauthenticated import accepted';
 exception when raise_exception then if sqlerrm<>'AUTH_REQUIRED' then raise; end if; end;
end $$;
rollback;
