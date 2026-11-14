-- Disposable database only. Regressions found while reviewing PR #121.
\set ON_ERROR_STOP on
begin;
insert into auth.users values('99999999-9999-4999-8999-999999999999');
set local role authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
do $$ declare m uuid; other uuid; res jsonb; h jsonb; page2 jsonb; d jsonb;
 slot timestamptz; version bigint; n integer; oldversion bigint;
begin
 res:=health_treatment_save(jsonb_build_object('name','Regression A','dose','1',
  'mode','interval','timezone','UTC','anchor_date',(current_date-30)::text,
  'anchor_time','06:00','interval_minutes',480,'duration_kind','continuous',
  'reminders_enabled',true),gen_random_uuid());
 m:=(res->>'id')::uuid;
 h:=health_treatment_history(m);
 if h->'rows'->0->>'planned_amount'<>'1' then raise exception 'historical dose snapshot missing';end if;
 if jsonb_array_length(h->'rows')<>20 or not (h->>'has_more')::boolean then raise exception 'history first page';end if;
 page2:=health_treatment_history(m,'all',(h->>'next_cursor_at')::timestamptz);
 if jsonb_array_length(page2->'rows')<>20 then raise exception 'history second page';end if;
 if exists(select 1 from jsonb_array_elements(h->'rows') a join jsonb_array_elements(page2->'rows') b on a->>'scheduled_at'=b->>'scheduled_at') then raise exception 'duplicate page boundary';end if;
 if (health_treatment_list('all','regression',20,0)->>'has_more')::boolean then raise exception 'single row has_more';end if;
 select scheduled_at into slot from health_private.schedule_slots(
  '99999999-9999-4999-8999-999999999999',m,now()-interval '1 day',now()) order by scheduled_at desc limit 1;
 res:=health_dose_record(m,slot,'taken',now(),'1','',0,gen_random_uuid());
 version:=(res->>'row_version')::bigint;
 if version<>1 then raise exception 'first persistent version must be one';end if;
 begin
  perform health_dose_record(m,slot,'skipped',null,'','',0,gen_random_uuid());
  raise exception 'second creator overwrote first';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 perform health_dose_undo(m,slot,version,gen_random_uuid());
 res:=health_dose_record(m,slot,'taken',now(),'1','',0,gen_random_uuid());
 if (res->>'row_version')::bigint<=version then raise exception 'ABA version reset';end if;
 begin
  perform health_dose_undo(m,slot,version,gen_random_uuid());
  raise exception 'stale undo removed recreated record';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 perform health_treatment_state(m,'pause',now()+interval '1 second',null,'',gen_random_uuid());
 perform health_treatment_state(m,'resume',now()+interval '2 seconds',null,'',gen_random_uuid());
 select count(*) into n from health_reminders where medication_id=m and dismissed_at is null;
 if n=0 then raise exception 'resume lost all reminders';end if;
 -- A legacy/manual record off the schedule must remain in history.
 insert into health_doses(medication_id,scheduled_at,taken_at,status,amount)
 values(m,now()-interval '15 minutes',now()-interval '14 minutes','taken','Legacy');
 h:=health_treatment_history(m,'taken');
 if not exists(select 1 from jsonb_array_elements(h->'rows') e where e->>'amount'='Legacy') then raise exception 'legacy manual record hidden';end if;
 -- A second treatment contributes to the global totals; skipped is not taken.
 res:=health_treatment_save(jsonb_build_object('name','Regression B','dose','1',
  'mode','daily_times','timezone','UTC','local_start_date',current_date::text,
  'local_times',jsonb_build_array('00:00','12:00'),'duration_kind','continuous',
  'reminders_enabled',false),gen_random_uuid());other:=(res->>'id')::uuid;
 perform health_dose_record(other,current_date::timestamptz,'skipped',null,'','',0,gen_random_uuid());
 d:=health_treatment_detail(other);
 if (d->'stats'->>'taken_total')::int<>0 or (d->'stats'->>'skipped_total')::int<>1 then raise exception 'skipped counted as taken';end if;
 h:=health_treatment_dashboard('UTC');
 if (h->'today'->>'planned')::int<>5 or (h->'today'->>'skipped')::int<>1 then raise exception 'dashboard failed global aggregation: %',h;end if;
 -- Disabling push must not cancel the schedule or its slots.
 select count(*) into n from health_private.schedule_slots('99999999-9999-4999-8999-999999999999',other,now(),now()+interval '1 day');
 if n<>2 then raise exception 'reminders disabled removed agenda';end if;
 select count(*) into n from health_medication_occurrences where medication_id=other and canceled_at is not null;
 if n<>0 then raise exception 'disabled reminders canceled occurrence';end if;
 select row_version into oldversion from health_medications where id=m;
 -- Preserve interval after a future-only revision; offset must be reconciled.
 perform health_treatment_save(jsonb_build_object('id',m,'expected_version',oldversion,'name','Regression A',
  'dose','1','mode','interval','timezone','UTC','anchor_date',(current_date-30)::text,
  'anchor_time','06:00','interval_minutes',480,'duration_kind','continuous',
  'reminders_enabled',true,'reminder_offset_minutes',30,'effective_from',now()+interval '3 seconds'),gen_random_uuid());
 if not exists(select 1 from health_reminders where medication_id=m and dismissed_at is null and offset_minutes=30) then raise exception 'new offset not activated';end if;
end $$;
-- Explicit parent deletion remains distinct from finish and must not fail
-- due to an audit insert referencing its already-deleted parent.
delete from public.health_medications where name='Regression A';
do $$ begin
 if exists(select 1 from public.health_dose_events where medication_id not in
   (select id from public.health_medications)) then raise exception 'orphan audit';end if;
end $$;
reset role;
rollback;
\echo 'PASS: pagination, versions, ABA, resume, legacy history, totals, offsets'
