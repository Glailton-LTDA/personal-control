-- Read-only shared web/Android preview. No extra tables or reminder writes.
begin;
set local lock_timeout='5s';
create index my_day_pending_due on public.mf_transactions(user_id,(coalesce(due_date,payment_date)),id)
 where status='PENDENTE' and type='DESPESA' and invoice_close is null;
create index my_day_itinerary_date on public.trip_itinerary(user_id,day,id) where completed is not true;
create index my_day_trip_start on public.trips(user_id,start_date,id);

create function public.my_day_summary(p_timezone text default 'UTC',p_modules text[] default array['health','minhasfinancas','trips'])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 uid uuid:=(select auth.uid()); today date; first_at timestamptz; last_at timestamptz;
 result jsonb:='{}'::jsonb; payload jsonb; overflow boolean; meds_more boolean:=false;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
  raise exception 'INVALID_TIMEZONE' using errcode='22023';
 end if;
 today:=(now() at time zone p_timezone)::date;
 first_at:=today::timestamp at time zone p_timezone;
 last_at:=(today+8)::timestamp at time zone p_timezone;
 if 'health'=any(p_modules) then
 select exists(select 1 from public.health_medications where user_id=uid and status in ('active','paused') order by starts_on desc,id desc offset 20 limit 1) into meds_more;
 end if;
 if 'health'=any(p_modules) then
  with preview as materialized (
 select m.id::text||':'||s.scheduled_at::text as id,m.id medication_id,m.name title,s.scheduled_at,m.timezone,
 revision.dose_text_snapshot dose,coalesce(d.status,case when s.scheduled_at<=now() then 'missed' else 'scheduled' end) status,
 coalesce(d.row_version,0) record_version,d.taken_at
 from (select id,name,timezone from public.health_medications where user_id=uid and status in ('active','paused')
  order by starts_on desc,id desc limit 20) m
 cross join lateral (select scheduled_at,schedule_id from health_private.schedule_slots(uid,m.id,first_at,(today+1)::timestamp at time zone p_timezone)
  order by scheduled_at limit 21) s
 join public.health_medication_schedules revision on revision.user_id=uid and revision.id=s.schedule_id
 left join public.health_doses d on d.user_id=uid and d.medication_id=m.id and d.scheduled_at=s.scheduled_at
 order by s.scheduled_at,m.id limit 21
)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,medication_id,title,scheduled_at,timezone,dose,status,record_version,taken_at from preview order by scheduled_at,medication_id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('doses',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if meds_more then result:=jsonb_set(result,'{doses,has_more}','true'::jsonb); end if;
 if 'health'=any(p_modules) then
  with preview as materialized (select id,name title,starts_at scheduled_at,professional,address,status from public.health_appointments where user_id=uid and status='scheduled' and starts_at>=first_at and starts_at<last_at order by starts_at,id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,scheduled_at,professional,address,status from preview order by scheduled_at,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('appointments',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if 'health'=any(p_modules) then
  with preview as materialized (select id,name title,performed_at scheduled_at,laboratory from public.health_exams where user_id=uid and status='scheduled' and performed_at>=first_at and performed_at<last_at order by performed_at,id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,scheduled_at,laboratory from preview order by scheduled_at,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('exams',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if 'minhasfinancas'=any(p_modules) then
  with preview as materialized (select t.id,t.description title,coalesce(t.due_date,t.payment_date)::text as day,t.amount,a.currency,t.account_id
 from public.mf_transactions t join public.mf_accounts a on a.id=t.account_id and a.user_id=uid
 where t.user_id=uid and t.status='PENDENTE' and t.type='DESPESA' and t.invoice_close is null
 and a.account_type<>'CARTAO' and coalesce(t.due_date,t.payment_date)>=today-7 and coalesce(t.due_date,t.payment_date)<=today+7
 order by coalesce(t.due_date,t.payment_date),t.id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,day,amount,currency,account_id from preview order by day,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('payments',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if 'minhasfinancas'=any(p_modules) then
  with preview as materialized (select i.id,a.name title,i.due_date::text as day,greatest(i.total-i.paid_total,0) amount,a.currency,i.card_id account_id
 from public.mf_invoices i join public.mf_accounts a on a.id=i.card_id and a.user_id=uid
 where i.user_id=uid and i.status in ('OPEN','OVERDUE','SCHEDULED') and i.total>i.paid_total
 and i.due_date>=today-7 and i.due_date<=today+7 order by i.due_date,i.id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,day,amount,currency,account_id from preview order by day,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('invoices',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if 'trips'=any(p_modules) then
  with preview as materialized (select i.id,i.activity title,i.day,i.time,i.location,i.trip_id,t.title trip_title
 from public.trip_itinerary i join public.trips t on t.id=i.trip_id and t.user_id=uid
 where i.user_id=uid and i.completed is not true and i.day>=today::text and i.day<=(today+7)::text
 order by i.day,i.time nulls last,i.id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,day,time,location,trip_id,trip_title from preview order by day,time,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('itinerary',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 if 'trips'=any(p_modules) then
  with preview as materialized (select id,title,start_date::text as day from public.trips where user_id=uid and start_date>=today and start_date<=today+7 order by start_date,id limit 21)
  select coalesce((select jsonb_agg(to_jsonb(r)) from (select id,title,day from preview order by day,id limit 20) r),'[]'::jsonb),
   exists(select 1 from preview offset 20) into payload,overflow;
  result:=result||jsonb_build_object('trips',jsonb_build_object('rows',payload,'has_more',overflow));
 end if;
 return jsonb_build_object('day',today,'generated_at',now(),'sections',result);
end $$;
revoke all on function public.my_day_summary(text,text[]) from public,anon;
grant execute on function public.my_day_summary(text,text[]) to authenticated;
commit;
