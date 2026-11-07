-- The managed auth schema does not grant USAGE WITH GRANT OPTION to postgres.
-- Resolve auth.uid at definition time using SQL-standard body/OIDs, without
-- granting the scheduler any wider schema or authenticated-role privileges.
begin;
create function health_private.request_user_id() returns uuid
language sql stable security invoker set search_path='' return auth.uid();
revoke all on function health_private.request_user_id() from public,anon,authenticated;
grant execute on function health_private.request_user_id() to health_scheduler;
alter policy health_scheduler_medications on public.health_medications
using(user_id=(select health_private.request_user_id()))
with check(user_id=(select health_private.request_user_id()));
alter policy health_scheduler_appointments on public.health_appointments
using(user_id=(select health_private.request_user_id()))
with check(user_id=(select health_private.request_user_id()));
alter policy health_scheduler_exams on public.health_exams
using(user_id=(select health_private.request_user_id()))
with check(user_id=(select health_private.request_user_id()));
alter policy health_scheduler_doses on public.health_doses
using(user_id=(select health_private.request_user_id()))
with check(user_id=(select health_private.request_user_id()));
alter policy health_scheduler_reminders on public.health_reminders
using(user_id=(select health_private.request_user_id()))
with check(user_id=(select health_private.request_user_id()));
create or replace function health_private.schedule_record() returns trigger
language plpgsql security definer set search_path='' as $body$
declare d date; tm time; occurrence timestamptz; minutes integer;
begin
 if new.user_id is distinct from health_private.request_user_id() then raise exception 'ownership required' using errcode='42501'; end if;
 if tg_table_name='health_medications' then
  if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'invalid timezone' using errcode='22023'; end if;
  delete from public.health_reminders where user_id=new.user_id and medication_id=new.id and scheduled_at>now() and dismissed_at is null;
  if new.status='active' and new.reminders_enabled then
   for d in select generate_series(greatest(new.starts_on,(now() at time zone new.timezone)::date),least(coalesce(new.ends_on,current_date+14),current_date+14),'1 day')::date loop
    foreach tm in array new.times loop
     occurrence := (d+tm) at time zone new.timezone;
     if occurrence>now() then
      insert into public.health_reminders(user_id,medication_id,scheduled_at,remind_at)
      values(new.user_id,new.id,occurrence,occurrence) on conflict do nothing;
     end if;
    end loop;
   end loop;
  end if;
  if new.status<>'active' or not new.reminders_enabled then
   update public.health_reminders set dismissed_at=now() where user_id=new.user_id and medication_id=new.id and dismissed_at is null;
  end if;
 elsif tg_table_name='health_appointments' then
  delete from public.health_reminders where user_id=new.user_id and appointment_id=new.id and dismissed_at is null;
  if new.status='scheduled' then
   foreach minutes in array new.reminder_minutes loop
    if new.starts_at-make_interval(mins=>minutes)>now() then
     insert into public.health_reminders(user_id,appointment_id,scheduled_at,offset_minutes,remind_at)
     values(new.user_id,new.id,new.starts_at,minutes,new.starts_at-make_interval(mins=>minutes)) on conflict do nothing;
    end if;
   end loop;
  end if;
 elsif tg_table_name='health_exams' then
  delete from public.health_reminders where user_id=new.user_id and exam_id=new.id and dismissed_at is null;
  if new.status='scheduled' and new.performed_at is not null then
   foreach minutes in array new.reminder_minutes loop
    if new.performed_at-make_interval(mins=>minutes)>now() then
     insert into public.health_reminders(user_id,exam_id,scheduled_at,offset_minutes,remind_at)
     values(new.user_id,new.id,new.performed_at,minutes,new.performed_at-make_interval(mins=>minutes)) on conflict do nothing;
    end if;
   end loop;
  end if;
 end if;
 return new;
end;
$body$;
create or replace function health_private.dose_recorded() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if new.user_id is distinct from health_private.request_user_id() then raise exception 'ownership required' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.medication_id is distinct from old.medication_id or new.scheduled_at is distinct from old.scheduled_at) then
  raise exception 'dose schedule is immutable' using errcode='22023';
 end if;
 update public.health_reminders set dismissed_at=now()
 where user_id=new.user_id and medication_id=new.medication_id and scheduled_at=new.scheduled_at;
 return new;
end;
$body$;
create or replace function public.health_refresh_reminders() returns void
language plpgsql security definer set search_path='' as $body$
begin
 if health_private.request_user_id() is null then raise exception 'authentication required' using errcode='42501'; end if;
 insert into public.health_reminders(user_id,medication_id,scheduled_at,remind_at)
 select m.user_id,m.id,(d.day::date+tm.at) at time zone m.timezone,(d.day::date+tm.at) at time zone m.timezone
 from public.health_medications m
 cross join lateral generate_series((now() at time zone m.timezone)::date,((now() at time zone m.timezone)::date+2),'1 day') d(day)
 cross join lateral unnest(m.times) tm(at)
 where m.user_id=(select health_private.request_user_id()) and m.status='active' and m.reminders_enabled and m.starts_on<=d.day::date and (m.ends_on is null or m.ends_on>=d.day::date)
 and ((d.day::date+tm.at) at time zone m.timezone)>now()
 and not exists(select 1 from public.health_doses dose where dose.user_id=m.user_id and dose.medication_id=m.id and dose.scheduled_at=(d.day::date+tm.at) at time zone m.timezone)
 on conflict do nothing;
end;
$body$;
commit;
