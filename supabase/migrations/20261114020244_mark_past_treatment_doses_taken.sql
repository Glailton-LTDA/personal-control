-- Opt-in retrospective dose recording at treatment creation. No schema fork.
create or replace function public.health_treatment_save(
 p_payload jsonb, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare
 uid uuid:=health_private.request_user_id();
 v_cached jsonb; v_id uuid; v_new boolean:=false; v_existing public.health_medications%rowtype;
 v_name text; v_dose text; v_qty numeric; v_unit text; v_notes text; v_pres text;
 v_prof text; v_indication text; v_pharmacy text; v_batch text;
 v_mode text; v_tz text; v_anchor timestamptz; v_interval integer;
 v_start date; v_times time[]; v_kind text; v_days integer; v_end timestamptz;
 v_effective timestamptz; v_revision integer; v_sched uuid; v_version bigint;
 v_canceled integer:=0; v_status text; v_reminders boolean; v_offset integer;
 v_condition uuid; v_appointment uuid; v_start_instant timestamptz;
 v_local_anchor_date date; v_local_anchor_time time; t time;
 v_current record; v_schedule_changed boolean:=true;
 v_mark_past boolean:=false; v_past_count integer:=0;
 v_past_from timestamptz; v_past_to timestamptz; v_chunk_to timestamptz;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_cached:=health_private.command_cached(uid,p_request_id,'treatment_save',p_payload);
 if v_cached is not null then return v_cached; end if;
 v_id:=nullif(p_payload->>'id','')::uuid;
 if v_id is null then
  v_new:=true;
  v_id:=gen_random_uuid();
 else
  select id,user_id,name,dose,status,starts_on,ends_on,times,timezone,reminders_enabled,notes,condition_id,appointment_id,created_at,name_search,presentation_code,dose_quantity,dose_unit_code,professional_name,indication,pharmacy,batch,finished_at,finish_reason,paused_at,row_version,reminder_offset_minutes,schedule_pending into v_existing from public.health_medications
   where id=v_id and user_id=uid for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
  if nullif(p_payload->>'expected_version','') is not null
     and v_existing.row_version<>(p_payload->>'expected_version')::bigint then
   raise exception 'VERSION_CONFLICT' using errcode='P0001';
  end if;
 end if;
 if p_payload ? 'mark_past_doses_taken' and jsonb_typeof(p_payload->'mark_past_doses_taken')<>'boolean' then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_mark_past:=coalesce((p_payload->>'mark_past_doses_taken')::boolean,false);
 if v_mark_past and not v_new then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_name:=trim(coalesce(p_payload->>'name',v_existing.name,''));
 if length(v_name)<1 or length(v_name)>255 then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_mode:=coalesce(p_payload->>'mode',null);
 if v_mode not in ('interval','daily_times') then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_tz:=coalesce(nullif(p_payload->>'timezone',''),v_existing.timezone);
 if v_tz is null or not exists(select 1 from pg_timezone_names z where z.name=v_tz) then
  raise exception 'INVALID_TIMEZONE' using errcode='P0001';
 end if;
 v_kind:=coalesce(p_payload->>'duration_kind',null);
 if v_kind not in ('finite','continuous') then
  raise exception 'INVALID_DURATION' using errcode='P0001';
 end if;
 v_days:=nullif(p_payload->>'duration_days','')::integer;
 if v_kind='finite' and (v_days is null or v_days<1 or v_days>365) then
  raise exception 'INVALID_DURATION' using errcode='P0001';
 end if;
 if v_kind='continuous' then v_days:=null; end if;
 if nullif(p_payload->>'dose_quantity','') is not null then
  v_qty:=(p_payload->>'dose_quantity')::numeric;
  if v_qty<=0 or v_qty>1000000 then raise exception 'INVALID_SCHEDULE' using errcode='P0001'; end if;
 else
  v_qty:=v_existing.dose_quantity;
 end if;
 v_unit:=nullif(p_payload->>'dose_unit_code','');
 if v_unit is null then v_unit:=v_existing.dose_unit_code; end if;
 if v_unit is not null and (length(v_unit)>50) then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_dose:=trim(coalesce(p_payload->>'dose',v_existing.dose,''));
 if v_dose='' and v_qty is not null then
  v_dose:=trim(to_char(v_qty,'FM999999990.999')||coalesce(' '||v_unit,''));
 end if;
 if length(v_dose)<1 or length(v_dose)>255 then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_notes:=coalesce(p_payload->>'notes',v_existing.notes,'');
 v_pres:=coalesce(p_payload->>'presentation_code',v_existing.presentation_code,'');
 v_prof:=coalesce(p_payload->>'professional_name',v_existing.professional_name,'');
 v_indication:=coalesce(p_payload->>'indication',v_existing.indication,'');
 v_pharmacy:=coalesce(p_payload->>'pharmacy',v_existing.pharmacy,'');
 v_batch:=coalesce(p_payload->>'batch',v_existing.batch,'');
 if length(v_notes)>20000 or length(v_pres)>100 or length(v_prof)>255
    or length(v_indication)>1000 or length(v_pharmacy)>255 or length(v_batch)>100 then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_reminders:=coalesce((p_payload->>'reminders_enabled')::boolean,v_existing.reminders_enabled,true);
 v_offset:=coalesce(nullif(p_payload->>'reminder_offset_minutes','')::integer,
                    v_existing.reminder_offset_minutes,0);
 if v_offset<0 or v_offset>10080 then raise exception 'INVALID_SCHEDULE' using errcode='P0001'; end if;
 v_condition:=case when p_payload ? 'condition_id' then nullif(p_payload->>'condition_id','')::uuid else v_existing.condition_id end;
 v_appointment:=case when p_payload ? 'appointment_id' then nullif(p_payload->>'appointment_id','')::uuid else v_existing.appointment_id end;
 if v_new then
  v_status:='active';
 else
  v_status:=v_existing.status;
 end if;

 if v_mode='interval' then
  v_local_anchor_date:=nullif(p_payload->>'anchor_date','')::date;
  v_local_anchor_time:=nullif(p_payload->>'anchor_time','')::time;
  if v_local_anchor_date is null or v_local_anchor_time is null then
   raise exception 'INVALID_LOCAL_TIME' using errcode='P0001';
  end if;
  v_anchor:=health_private.local_instant(v_local_anchor_date,v_local_anchor_time,v_tz);
  if v_anchor is null then raise exception 'INVALID_LOCAL_TIME' using errcode='P0001'; end if;
  v_interval:=nullif(p_payload->>'interval_minutes','')::integer;
  if v_interval is null or v_interval<60 or v_interval>10080 then
   raise exception 'INVALID_INTERVAL' using errcode='P0001';
  end if;
  v_start:=(v_anchor at time zone v_tz)::date;
  v_times:=array[(v_anchor at time zone v_tz)::time];
  v_end:=case when v_kind='finite' then v_anchor+make_interval(days=>v_days) else null end;
  v_effective:=case when v_new then least(v_anchor,now())
    else greatest(now(),coalesce(nullif(p_payload->>'effective_from','')::timestamptz,now())) end;
 else
  v_start:=nullif(p_payload->>'local_start_date','')::date;
  if v_start is null then raise exception 'INVALID_LOCAL_TIME' using errcode='P0001'; end if;
  if jsonb_typeof(p_payload->'local_times')<>'array' then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  select array_agg(x::time order by x::time) into v_times
   from jsonb_array_elements_text(p_payload->'local_times') x;
  if v_times is null or cardinality(v_times)<1 or cardinality(v_times)>24 then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  if cardinality(v_times)<>(select count(distinct x) from unnest(v_times) x) then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  v_end:=case when v_kind='finite'
    then (((v_start+v_days)::timestamp) at time zone v_tz) else null end;
  v_start_instant:=((v_start::timestamp) at time zone v_tz);
  v_effective:=case when v_new then least(v_start_instant,now())
    else greatest(now(),coalesce(nullif(p_payload->>'effective_from','')::timestamptz,now())) end;
 end if;

 if not v_new then
  select id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,
    duration_kind,duration_days,dose_text_snapshot,quantity_snapshot,unit_snapshot
  into v_current from public.health_medication_schedules
  where user_id=uid and medication_id=v_id order by revision desc limit 1;
  v_schedule_changed:=not found or v_current.mode is distinct from v_mode
   or v_current.timezone is distinct from v_tz
   or v_current.duration_kind is distinct from v_kind
   or v_current.duration_days is distinct from v_days
   or v_current.dose_text_snapshot is distinct from v_dose
   or v_current.quantity_snapshot is distinct from v_qty
   or v_current.unit_snapshot is distinct from v_unit
   or (v_mode='interval' and (v_current.anchor_at is distinct from v_anchor or v_current.interval_minutes is distinct from v_interval))
   or (v_mode='daily_times' and (v_current.local_start_date is distinct from v_start or v_current.local_times is distinct from v_times));
  if v_schedule_changed and v_status<>'active' then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
 end if;
 if not v_new and v_schedule_changed then
  if exists(select 1 from public.health_doses d
    where d.user_id=uid and d.medication_id=v_id and d.scheduled_at>=v_effective) then
   raise exception 'SCHEDULE_HAS_RECORDED_OCCURRENCES' using errcode='P0001';
  end if;
  -- Materialize the recent future window so cancellations remain visible in history.
  perform health_private.ensure_occurrences(uid,v_id,v_effective,
    least(v_effective+interval '14 days',coalesce(v_end,'infinity'::timestamptz)));
  update public.health_medication_schedules set effective_until=v_effective
   where user_id=uid and medication_id=v_id
    and (effective_until is null or effective_until>v_effective);
  update public.health_medication_occurrences
   set canceled_at=v_effective,cancellation_reason='schedule_changed'
   where user_id=uid and medication_id=v_id and scheduled_at>=v_effective
    and canceled_at is null
    and not exists(select 1 from public.health_doses d
      where d.user_id=uid and d.medication_id=v_id
       and d.scheduled_at=health_medication_occurrences.scheduled_at);
  get diagnostics v_canceled=row_count;
  update public.health_reminders set dismissed_at=now()
   where user_id=uid and medication_id=v_id and scheduled_at>=v_effective
    and dismissed_at is null;
 end if;
 if v_schedule_changed then
  select coalesce(max(revision),0)+1 into v_revision
   from public.health_medication_schedules where user_id=uid and medication_id=v_id;
 else v_revision:=v_current.revision; v_sched:=v_current.id; end if;
 perform set_config('health.schedule_api','1',true);
 if v_new then
  insert into public.health_medications(
   id,user_id,name,dose,status,starts_on,ends_on,times,timezone,reminders_enabled,notes,
   condition_id,appointment_id,presentation_code,dose_quantity,dose_unit_code,
   professional_name,indication,pharmacy,batch,reminder_offset_minutes)
  values(v_id,uid,v_name,v_dose,v_status,v_start,
   case when v_kind='finite' then
    case when v_mode='daily_times' then v_start+v_days-1
     else ((v_end-interval '1 second') at time zone v_tz)::date end
   else null end,
   v_times,v_tz,v_reminders,v_notes,v_condition,v_appointment,v_pres,v_qty,v_unit,
   v_prof,v_indication,v_pharmacy,v_batch,v_offset)
  returning row_version into v_version;
 end if;
 if v_schedule_changed then
 insert into public.health_medication_schedules(
  user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,
  local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,
  effective_from,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_by_request_id)
 values(uid,v_id,v_revision,v_mode,v_tz,
  case when v_mode='interval' then v_anchor end,
  case when v_mode='interval' then v_interval end,
  case when v_mode='daily_times' then v_start end,
  case when v_mode='daily_times' then v_times end,
  v_kind,v_days,v_end,v_effective,v_dose,v_qty,v_unit,p_request_id)
 returning id into v_sched;
 end if;
 if not v_new and v_schedule_changed then
  -- Re-activate occurrences at times still planned by the new revision.
  update public.health_medication_occurrences o
   set canceled_at=null,cancellation_reason=null,schedule_id=v_sched
   where o.user_id=uid and o.medication_id=v_id
    and o.canceled_at is not null and o.cancellation_reason='schedule_changed'
    and o.scheduled_at>=v_effective and o.scheduled_at<v_effective+interval '14 days'
    and exists(select 1 from health_private.schedule_slots(
      uid,v_id,v_effective,v_effective+interval '14 days') s
      where s.scheduled_at=o.scheduled_at);
 end if;
 if not v_new then
  update public.health_medications set
   name=v_name,dose=v_dose,starts_on=v_start,
   ends_on=case when v_kind='finite' then
    case when v_mode='daily_times' then v_start+v_days-1
     else ((v_end-interval '1 second') at time zone v_tz)::date end
   else null end,
   times=v_times,timezone=v_tz,reminders_enabled=v_reminders,notes=v_notes,
   condition_id=v_condition,appointment_id=v_appointment,presentation_code=v_pres,
   dose_quantity=v_qty,dose_unit_code=v_unit,professional_name=v_prof,
   indication=v_indication,pharmacy=v_pharmacy,batch=v_batch,
   reminder_offset_minutes=v_offset,schedule_pending=false
  where id=v_id and user_id=uid
  returning row_version into v_version;
 end if;
 perform set_config('health.schedule_api','',true);

 -- Only explicit opt-in at creation. now() is the transaction's fixed server
 -- cutoff. Future doses and the exclusive treatment end are never included.
 -- Existing audit triggers attach actor, request ID and actual registration time.
 if v_mark_past then
  v_past_from:=case when v_mode='interval' then v_anchor else v_start_instant end;
  v_past_to:=least(now(),coalesce(v_end,now()));
  if v_past_to-v_past_from>interval '3650 days' then
   raise exception 'WINDOW_TOO_LARGE' using errcode='P0001';
  end if;
  perform set_config('health.request_id',coalesce(p_request_id::text,''),true);
  while v_past_from<v_past_to loop
   -- Each chunk has at most 720 interval/daily slots (24 per day).
   v_chunk_to:=least(v_past_from+interval '30 days',v_past_to);
   v_past_count:=v_past_count+health_private.ensure_occurrences(uid,v_id,v_past_from,v_chunk_to);
   if v_past_count>10000 then
    raise exception 'WINDOW_TOO_LARGE' using errcode='P0001';
   end if;
   insert into public.health_doses(
    user_id,medication_id,occurrence_id,scheduled_at,taken_at,status,amount,reason)
   select uid,v_id,o.id,o.scheduled_at,o.scheduled_at,'taken',v_dose,'retroactive_at_creation'
   from public.health_medication_occurrences o
   where o.user_id=uid and o.medication_id=v_id and o.canceled_at is null
    and o.scheduled_at>=v_past_from and o.scheduled_at<v_chunk_to;
   v_past_from:=v_chunk_to;
  end loop;
  perform set_config('health.request_id','',true);
 end if;

 if not v_reminders or v_status<>'active' then
  update public.health_reminders set dismissed_at=now()
   where user_id=uid and medication_id=v_id and scheduled_at>=now() and dismissed_at is null;
 end if;
 if v_status='active' and v_reminders
    and (v_new or v_schedule_changed or v_reminders is distinct from v_existing.reminders_enabled
     or v_offset is distinct from v_existing.reminder_offset_minutes) then
  perform health_private.ensure_occurrences(uid,v_id,
   greatest(v_effective,now()),greatest(v_effective,now())+interval '14 days');
  insert into public.health_reminders(user_id,medication_id,scheduled_at,offset_minutes,remind_at)
  select o.user_id,o.medication_id,o.scheduled_at,v_offset,
         o.scheduled_at-make_interval(mins=>v_offset)
  from public.health_medication_occurrences o
  where o.user_id=uid and o.medication_id=v_id and o.canceled_at is null
   and o.scheduled_at>=now() and o.scheduled_at<now()+interval '14 days'
   and o.scheduled_at-make_interval(mins=>v_offset)>=now()
   and not exists(select 1 from public.health_doses d
     where d.user_id=o.user_id and d.medication_id=o.medication_id
      and d.scheduled_at=o.scheduled_at)
  on conflict (user_id,medication_id,scheduled_at) where medication_id is not null
  do update set offset_minutes=excluded.offset_minutes,remind_at=excluded.remind_at,
    dismissed_at=null,claimed_until=null
  where public.health_reminders.delivered_at is null and excluded.remind_at>=now();
 end if;

 v_cached:=jsonb_build_object(
  'id',v_id,'row_version',v_version,'revision',v_revision,
  'canceled_occurrences',v_canceled,'schedule_id',v_sched,'past_doses_recorded',v_past_count,
  'next_occurrences',coalesce((
   select jsonb_agg(x.scheduled_at order by x.scheduled_at)
   from (select s.scheduled_at from health_private.schedule_slots(uid,v_id,now(),now()+interval '8 days') s
         order by s.scheduled_at limit 5) x),'[]'::jsonb));
 perform health_private.command_store(uid,p_request_id,'treatment_save',p_payload,v_cached);
 return v_cached;
end $body$;

create or replace function public.health_treatment_detail(p_medication_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); m public.health_medications%rowtype; r record;
 v_tz text; v_today_start timestamptz; v_today_end timestamptz; v_week_start timestamptz;
 v_week_end timestamptz; v_recent timestamptz; v_total integer; v_taken_total integer;
 v_skipped_total integer; v_due integer; v_taken_due integer; v_overdue integer;
 v_today jsonb; v_next jsonb; v_week jsonb; v_last timestamptz; v_first timestamptz;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 select id,user_id,name,dose,status,starts_on,ends_on,times,timezone,reminders_enabled,notes,condition_id,appointment_id,created_at,name_search,presentation_code,dose_quantity,dose_unit_code,professional_name,indication,pharmacy,batch,finished_at,finish_reason,paused_at,row_version,reminder_offset_minutes,schedule_pending into m from public.health_medications where id=p_medication_id and user_id=uid;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
 select id,user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,effective_from,effective_until,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_at,created_by_request_id into r from public.health_medication_schedules
  where user_id=uid and medication_id=p_medication_id
  order by effective_from desc,revision desc limit 1;
 select count(*) filter (where status='taken'),count(*) filter (where status='taken'),count(*) filter (where status='skipped')
 into v_taken_total,v_taken_due,v_skipped_total
 from public.health_doses where user_id=uid and medication_id=p_medication_id;
 if not found or r.id is null then
  return jsonb_build_object('medication',jsonb_build_object(
   'id',m.id,'name',m.name,'status',m.status,'dose',m.dose,
   'presentation_code',m.presentation_code,'dose_quantity',m.dose_quantity,
   'dose_unit_code',m.dose_unit_code,'starts_on',m.starts_on,'ends_on',m.ends_on,
   'timezone',m.timezone,'reminders_enabled',m.reminders_enabled,
   'reminder_offset_minutes',m.reminder_offset_minutes,'notes',m.notes,
   'professional_name',m.professional_name,'indication',m.indication,
   'pharmacy',m.pharmacy,'batch',m.batch,'finished_at',m.finished_at,
   'finish_reason',m.finish_reason,'row_version',m.row_version,
   'schedule_pending',m.schedule_pending,'condition_id',m.condition_id,
   'appointment_id',m.appointment_id),
   'schedule',null,'pending',true,'stats',null,'today',null,'next','[]'::jsonb,'week',null);
 end if;
 v_tz:=r.timezone;
 v_today_start:=((now() at time zone v_tz)::date::timestamp) at time zone v_tz;
 v_today_end:=(((now() at time zone v_tz)::date+1)::timestamp) at time zone v_tz;
 v_week_start:=(((date_trunc('week',now() at time zone v_tz))::date)::timestamp) at time zone v_tz;
 v_week_end:=((((date_trunc('week',now() at time zone v_tz))::date+7)::timestamp) at time zone v_tz);
 v_recent:=greatest(r.effective_from,now()-interval '42 days');
 select coalesce(sum(health_private.revision_total(s.id)),0) into v_total
  from public.health_medication_schedules s
  where s.user_id=uid and s.medication_id=p_medication_id;
 if r.duration_kind='continuous' then v_total:=null; end if;
 select count(*),count(*) filter (where d.status='taken'),
  count(*) filter (where d.id is null and s.scheduled_at<=now())
 into v_due,v_taken_due,v_overdue
 from health_private.schedule_slots(uid,p_medication_id,v_recent,now()) s
 left join public.health_doses d on d.user_id=uid and d.medication_id=p_medication_id
  and d.scheduled_at=s.scheduled_at;
 v_today:=coalesce((
  select jsonb_agg(jsonb_build_object('scheduled_at',s.scheduled_at,
   'status',case when d.id is null then
     case when s.scheduled_at<=now() then 'missed' else 'scheduled' end
     else d.status end,'record_version',coalesce(d.row_version,0),
   'taken_at',d.taken_at,'reason',d.reason,'amount',d.amount,'planned_amount',revision.dose_text_snapshot)
   order by s.scheduled_at)
  from health_private.schedule_slots(uid,p_medication_id,v_today_start,v_today_end) s
  join public.health_medication_schedules revision on revision.user_id=uid and revision.id=s.schedule_id
  left join public.health_doses d on d.user_id=uid and d.medication_id=p_medication_id
   and d.scheduled_at=s.scheduled_at),'[]'::jsonb);
 v_next:=coalesce((
  select jsonb_agg(jsonb_build_object('scheduled_at',s.scheduled_at)
   order by s.scheduled_at)
  from (select s.scheduled_at from health_private.schedule_slots(uid,p_medication_id,now(),now()+interval '8 days') s
        order by s.scheduled_at limit 12) s),'[]'::jsonb);
 select jsonb_build_object('planned',count(*),
   'taken',count(*) filter (where d.status='taken'),
   'skipped',count(*) filter (where d.status='skipped'),
   'overdue',count(*) filter (where d.id is null and s.scheduled_at<=now()))
 into v_week
 from health_private.schedule_slots(uid,p_medication_id,v_week_start,v_week_end) s
 left join public.health_doses d on d.user_id=uid and d.medication_id=p_medication_id
  and d.scheduled_at=s.scheduled_at;
 v_last:=health_private.last_slot(r.id);
 v_first:=r.effective_from;
 return jsonb_build_object(
  'medication',jsonb_build_object(
   'id',m.id,'name',m.name,'status',m.status,'dose',m.dose,
   'presentation_code',m.presentation_code,'dose_quantity',m.dose_quantity,
   'dose_unit_code',m.dose_unit_code,'starts_on',m.starts_on,'ends_on',m.ends_on,
   'timezone',m.timezone,'reminders_enabled',m.reminders_enabled,
   'reminder_offset_minutes',m.reminder_offset_minutes,'notes',m.notes,
   'professional_name',m.professional_name,'indication',m.indication,
   'pharmacy',m.pharmacy,'batch',m.batch,'finished_at',m.finished_at,
   'finish_reason',m.finish_reason,'row_version',m.row_version,
   'schedule_pending',m.schedule_pending,'condition_id',m.condition_id,
   'appointment_id',m.appointment_id),
  'schedule',jsonb_build_object('id',r.id,'revision',r.revision,'mode',r.mode,
   'timezone',r.timezone,'anchor_at',r.anchor_at,'interval_minutes',r.interval_minutes,
   'local_start_date',r.local_start_date,'local_times',r.local_times,
   'duration_kind',r.duration_kind,'duration_days',r.duration_days,
   'end_exclusive_at',r.end_exclusive_at,'effective_from',r.effective_from,
   'first_slot',v_first,'last_slot',v_last),
  'pending',false,
  'stats',jsonb_build_object('total_predicted',v_total,'taken_total',v_taken_total,
   'skipped_total',v_skipped_total,'due_recent',v_due,'taken_due',v_taken_due,
   'overdue',v_overdue,'window_start',v_recent),
  'today',v_today,'next',v_next,'week',v_week);
end $body$;

create or replace function public.health_treatment_calendar(
 p_medication_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); v_tz text; v_start timestamptz; v_end timestamptz;
 v_days jsonb:='[]'::jsonb; v_count integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_medication_id is null or p_from is null or p_to is null or p_to<p_from then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 if p_to-p_from+1>42 then
  raise exception 'WINDOW_TOO_LARGE' using errcode='P0001';
 end if;
 if not exists(select 1 from public.health_medications
   where id=p_medication_id and user_id=uid) then
  raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001';
 end if;
 select s.timezone into v_tz
 from public.health_medication_schedules s
 where s.user_id=uid and s.medication_id=p_medication_id
 order by s.effective_from desc,s.revision desc limit 1;
 if v_tz is null then
  return jsonb_build_object('timezone','UTC','from',p_from,'to',p_to,'days',v_days);
 end if;
 v_start:=(p_from::timestamp) at time zone v_tz;
 v_end:=((p_to+1)::timestamp) at time zone v_tz;
 perform health_private.assert_budget(uid,p_medication_id,v_start,v_end);
 select coalesce(jsonb_agg(jsonb_build_object('date',g.local_date,'slots',g.slots)
   order by g.local_date),'[]'::jsonb)
 into v_days
 from (
  select x.local_date,
   jsonb_agg(jsonb_build_object(
    'scheduled_at',x.scheduled_at,
    'status',x.status,
    'dose_id',x.dose_id,
    'record_version',coalesce(x.row_version,0),
    'taken_at',x.taken_at,
    'reason',x.reason,'amount',coalesce(x.amount,''),'planned_amount',x.planned_amount)
    order by x.scheduled_at) as slots
  from (
   select s.scheduled_at,
    (s.scheduled_at at time zone v_tz)::date as local_date,
    case when d.id is null then
      case when s.scheduled_at<=now() then 'missed' else 'scheduled' end
      else d.status end as status,
    d.id as dose_id,d.row_version,d.taken_at,d.reason,d.amount,revision.dose_text_snapshot as planned_amount
   from health_private.schedule_slots(uid,p_medication_id,v_start,v_end) s
   join public.health_medication_schedules revision on revision.user_id=uid and revision.id=s.schedule_id
   left join public.health_doses d on d.user_id=uid and d.medication_id=p_medication_id
    and d.scheduled_at=s.scheduled_at
  ) x
  group by x.local_date
 ) g;
 select coalesce(sum(jsonb_array_length(e->'slots')),0) into v_count
  from jsonb_array_elements(v_days) e;
 return jsonb_build_object('timezone',v_tz,'from',p_from,'to',p_to,
  'slots',v_count,'days',v_days);
end $body$;
