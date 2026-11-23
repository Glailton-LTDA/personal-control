-- Shared web/Android contract. Existing owner policies and unique user index
-- apply to this preference; no preference row means details remain hidden.
begin;
alter table public.notification_settings
 add column show_medication_details boolean not null default false;
comment on column public.notification_settings.show_medication_details is
 'Account-wide opt-in to medication name, dose and time in push notifications. Default false.';

-- Preserve the baseline owner rule, resolving the stable auth helper once.
alter policy "Users can manage their own settings" on public.notification_settings
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create index health_doses_last_taken on public.health_doses(user_id,medication_id,taken_at desc)
 where status='taken';

-- Keep the paginated list contract, adding only the current local day slots.
-- At most 20 medications; the existing bounded slot generator is reused once
-- for both counts and slots. No per-card client calls or history download.
create or replace function public.health_treatment_list(
 p_group text default 'active', p_prefix text default '',
 p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); v_limit integer:=least(greatest(coalesce(p_limit,20),1),20);
 v_offset integer:=greatest(coalesce(p_offset,0),0); v_prefix text:=lower(trim(coalesce(p_prefix,'')));
 v_rows jsonb:='[]'::jsonb; m record; r record; v_start timestamptz; v_end timestamptz;
 v_next timestamptz; v_planned integer; v_taken integer; v_skipped integer; v_overdue integer;
 v_total integer; v_taken_total integer; v_has_more boolean; v_slots jsonb; v_last timestamptz;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 select exists(
  select 1 from (
   select id from public.health_medications
   where user_id=uid
     and (case when p_group='finished' then status='finished'
               when p_group='active' then status in ('active','paused')
               else true end)
     and (v_prefix='' or name_search>=v_prefix)
     and (v_prefix='' or name_search<v_prefix||chr(1114111))
   order by starts_on desc,id desc
   limit 1 offset v_offset+v_limit) x
 ) into v_has_more;
 for m in
  select id,name,status,dose,presentation_code,dose_quantity,dose_unit_code,
         starts_on,ends_on,timezone,reminders_enabled,reminder_offset_minutes,
         professional_name,indication,finished_at,finish_reason,row_version,schedule_pending
  from public.health_medications
  where user_id=uid
   and (case when p_group='finished' then status='finished'
             when p_group='active' then status in ('active','paused')
             else true end)
   and (v_prefix='' or name_search>=v_prefix)
   and (v_prefix='' or name_search<v_prefix||chr(1114111))
  order by starts_on desc,id desc
  limit v_limit offset v_offset
 loop
  select id,user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,effective_from,effective_until,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_at,created_by_request_id into r from public.health_medication_schedules
   where user_id=uid and medication_id=m.id
   order by effective_from desc,revision desc limit 1;
  v_planned:=0; v_taken:=0; v_skipped:=0; v_overdue:=0; v_next:=null; v_total:=null; v_slots:='[]'::jsonb;
  if found then
   v_start:=((now() at time zone r.timezone)::date::timestamp) at time zone r.timezone;
   v_end:=(((now() at time zone r.timezone)::date+1)::timestamp) at time zone r.timezone;
   select count(*),
    count(*) filter (where d.status='taken'),
    count(*) filter (where d.status='skipped'),
    count(*) filter (where d.id is null and s.scheduled_at<=now()),
    coalesce(jsonb_agg(jsonb_build_object(
      'scheduled_at',s.scheduled_at,
      'status',coalesce(d.status,case when s.scheduled_at<=now() then 'missed' else 'scheduled' end),
      'record_version',coalesce(d.row_version,0), 'taken_at',d.taken_at,
      'planned_amount',revision.dose_text_snapshot) order by s.scheduled_at),'[]'::jsonb)
   into v_planned,v_taken,v_skipped,v_overdue,v_slots
   from health_private.schedule_slots(uid,m.id,v_start,v_end) s
   join public.health_medication_schedules revision on revision.user_id=uid and revision.id=s.schedule_id
   left join public.health_doses d on d.user_id=uid and d.medication_id=m.id
    and d.scheduled_at=s.scheduled_at;
   select s.scheduled_at into v_next
   from health_private.schedule_slots(uid,m.id,now(),now()+interval '8 days') s
   order by s.scheduled_at limit 1;
   select sum(health_private.revision_total(rv.id)) into v_total
    from public.health_medication_schedules rv
    where rv.user_id=uid and rv.medication_id=m.id;
  end if;
  select count(*) into v_taken_total from public.health_doses
   where user_id=uid and medication_id=m.id and status='taken';
  select taken_at into v_last from public.health_doses
   where user_id=uid and medication_id=m.id and status='taken'
   order by taken_at desc limit 1;
  v_rows:=v_rows||jsonb_build_object(
   'id',m.id,'name',m.name,'status',m.status,'dose',m.dose,
   'presentation_code',m.presentation_code,'dose_quantity',m.dose_quantity,
   'dose_unit_code',m.dose_unit_code,'starts_on',m.starts_on,'ends_on',m.ends_on,
   'timezone',m.timezone,'reminders_enabled',m.reminders_enabled,
   'reminder_offset_minutes',m.reminder_offset_minutes,
   'professional_name',m.professional_name,'indication',m.indication,
   'finished_at',m.finished_at,'finish_reason',m.finish_reason,
   'row_version',m.row_version,'schedule_pending',m.schedule_pending,
   'schedule',case when r.id is null then null else jsonb_build_object(
     'mode',r.mode,'timezone',r.timezone,'interval_minutes',r.interval_minutes,
     'local_times',r.local_times,'local_start_date',r.local_start_date,
     'anchor_at',r.anchor_at,'duration_kind',r.duration_kind,
     'duration_days',r.duration_days,'end_exclusive_at',r.end_exclusive_at,
     'effective_from',r.effective_from) end,
   'today',jsonb_build_object('planned',v_planned,'taken',v_taken,
     'skipped',v_skipped,'overdue',v_overdue,'slots',v_slots),
   'last_taken_at',v_last,'next_at',v_next,'total_predicted',v_total,'taken_total',v_taken_total);
 end loop;
 return jsonb_build_object('rows',v_rows,'has_more',v_has_more);
end $body$;


commit;
