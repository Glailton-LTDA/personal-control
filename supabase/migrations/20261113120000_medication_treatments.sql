begin;
-- ===== 01-schema.sql =====
-- Medication treatments: schedule revisions, occurrences, dose audit and RPCs.
-- Additive only. Legacy columns/tables are preserved for older clients.

-- ---------------------------------------------------------------------------
-- 1. Treatment fields (nullable / defaulted; legacy `dose` stays required)
-- ---------------------------------------------------------------------------
alter table public.health_medications
 add column if not exists presentation_code text not null default '' check(length(presentation_code)<=100),
 add column if not exists dose_quantity numeric(12,3) check(dose_quantity is null or dose_quantity>0),
 add column if not exists dose_unit_code text check(dose_unit_code is null or length(dose_unit_code)<=50),
 add column if not exists professional_name text not null default '' check(length(professional_name)<=255),
 add column if not exists indication text not null default '' check(length(indication)<=1000),
 add column if not exists pharmacy text not null default '' check(length(pharmacy)<=255),
 add column if not exists batch text not null default '' check(length(batch)<=100),
 add column if not exists finished_at timestamptz,
 add column if not exists finish_reason text not null default '' check(length(finish_reason)<=1000),
 add column if not exists paused_at timestamptz,
 add column if not exists row_version bigint not null default 0 check(row_version>=0),
 add column if not exists reminder_offset_minutes integer not null default 0 check(reminder_offset_minutes between 0 and 10080),
 add column if not exists schedule_pending boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Schedule revisions
-- ---------------------------------------------------------------------------
create table public.health_medication_schedules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 medication_id uuid not null,
 revision integer not null check(revision>0),
 mode text not null check(mode in ('interval','daily_times')),
 timezone text not null check(length(timezone) between 1 and 100),
 anchor_at timestamptz,
 interval_minutes integer check(interval_minutes between 1 and 10080),
 local_start_date date,
 local_times time[],
 duration_kind text not null check(duration_kind in ('finite','continuous')),
 duration_days integer check(duration_days>0),
 end_exclusive_at timestamptz,
 effective_from timestamptz not null,
 effective_until timestamptz,
 dose_text_snapshot text not null check(length(dose_text_snapshot) between 1 and 255),
 quantity_snapshot numeric(12,3) check(quantity_snapshot is null or quantity_snapshot>0),
 unit_snapshot text check(unit_snapshot is null or length(unit_snapshot)<=50),
 created_at timestamptz not null default now(),
 created_by_request_id uuid,
 unique(user_id,id),
 unique(user_id,id,medication_id),
 unique(user_id,medication_id,revision),
 foreign key(user_id,medication_id) references public.health_medications(user_id,id) on delete cascade,
 check(effective_until is null or effective_until>effective_from),
 check(
  (mode='interval' and anchor_at is not null and interval_minutes is not null
    and local_start_date is null and local_times is null)
  or
  (mode='daily_times' and anchor_at is null and interval_minutes is null
    and local_start_date is not null and local_times is not null
    and cardinality(local_times) between 1 and 24
    and array_position(local_times,null) is null)
 ),
 check(
  (duration_kind='finite' and duration_days is not null and end_exclusive_at is not null)
  or (duration_kind='continuous' and duration_days is null and end_exclusive_at is null)
 )
);

create table public.health_medication_occurrences (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 medication_id uuid not null,
 schedule_id uuid not null,
 scheduled_at timestamptz not null,
 record_version bigint not null default 0 check(record_version>=0),
 canceled_at timestamptz,
 cancellation_reason text check(cancellation_reason in ('schedule_changed','paused','finished')),
 created_at timestamptz not null default now(),
 unique(user_id,id),
 unique(user_id,medication_id,id),
 unique(user_id,medication_id,scheduled_at),
 foreign key(user_id,medication_id) references public.health_medications(user_id,id) on delete cascade,
 foreign key(user_id,schedule_id,medication_id)
  references public.health_medication_schedules(user_id,id,medication_id) on delete cascade,
 check((canceled_at is null and cancellation_reason is null)
   or (canceled_at is not null and cancellation_reason is not null))
);

create table public.health_dose_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 medication_id uuid not null,
 occurrence_id uuid,
 action text not null check(action in ('taken','skipped','updated','undone')),
 status text check(status in ('taken','skipped')),
 scheduled_at timestamptz,
 taken_at timestamptz,
 amount text check(amount is null or length(amount)<=255),
 reason text check(reason is null or length(reason)<=1000),
 actor_user_id uuid,
 request_id uuid,
 created_at timestamptz not null default now(),
 foreign key(user_id,medication_id) references public.health_medications(user_id,id) on delete cascade,
 foreign key(user_id,occurrence_id) references public.health_medication_occurrences(user_id,id) on delete set null (occurrence_id)
);

alter table public.health_doses
 add column if not exists occurrence_id uuid,
 add column if not exists row_version bigint not null default 1 check(row_version>=0),
 add column if not exists reason text not null default '' check(length(reason)<=1000),
 add column if not exists updated_at timestamptz not null default now();
alter table public.health_doses
 add constraint health_doses_occurrence_owner_fk
 foreign key(user_id,medication_id,occurrence_id)
 references public.health_medication_occurrences(user_id,medication_id,id);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index health_medication_schedules_current
 on public.health_medication_schedules(user_id,medication_id,effective_from desc,revision desc);
create index health_medication_occurrences_history
 on public.health_medication_occurrences(user_id,medication_id,scheduled_at desc,id desc);
create index health_medication_occurrences_window
 on public.health_medication_occurrences(user_id,scheduled_at,id);
create index health_medication_occurrences_canceled
 on public.health_medication_occurrences(user_id,medication_id,canceled_at)
 where canceled_at is not null;
create unique index health_doses_occurrence_current
 on public.health_doses(user_id,occurrence_id) where occurrence_id is not null;
create index health_doses_medication_window
 on public.health_doses(user_id,medication_id,scheduled_at desc);
create index health_dose_events_occurrence
 on public.health_dose_events(user_id,occurrence_id,created_at desc,id desc);
create index health_dose_events_recent
 on public.health_dose_events(user_id,created_at desc,id desc);
create index health_medications_group
 on public.health_medications(user_id,status,starts_on desc,id desc);

-- ---------------------------------------------------------------------------
-- 4. RLS and explicit grants
-- ---------------------------------------------------------------------------
alter table public.health_medication_schedules enable row level security;
alter table public.health_medication_occurrences enable row level security;
alter table public.health_dose_events enable row level security;
revoke all on public.health_medication_schedules from anon,authenticated;
revoke all on public.health_medication_occurrences from anon,authenticated;
revoke all on public.health_dose_events from anon,authenticated;
grant select on public.health_medication_schedules to authenticated;
grant select on public.health_medication_occurrences to authenticated;
grant select on public.health_dose_events to authenticated;
grant all on public.health_medication_schedules to service_role;
grant all on public.health_medication_occurrences to service_role;
grant all on public.health_dose_events to service_role;
create policy health_schedules_read on public.health_medication_schedules
 for select to authenticated using(user_id=(select auth.uid()));
create policy health_occurrences_read on public.health_medication_occurrences
 for select to authenticated using(user_id=(select auth.uid()));
create policy health_events_read on public.health_dose_events
 for select to authenticated using(user_id=(select auth.uid()));

-- The scheduler role is used only by SECURITY DEFINER functions/triggers.
grant select on public.health_medication_schedules to health_scheduler;
grant select,insert,update,delete on public.health_medication_occurrences to health_scheduler;
grant select,insert,update,delete on public.health_dose_events to health_scheduler;
grant select,insert,update,delete on public.health_dose_events to service_role;
grant select,insert,update,delete on public.health_doses to health_scheduler;
create policy health_scheduler_schedules on public.health_medication_schedules
 for all to health_scheduler
 using(user_id=(select health_private.request_user_id()))
 with check(user_id=(select health_private.request_user_id()));
create policy health_scheduler_occurrences on public.health_medication_occurrences
 for all to health_scheduler
 using(user_id=(select health_private.request_user_id()))
 with check(user_id=(select health_private.request_user_id()));
create policy health_scheduler_events on public.health_dose_events
 for all to health_scheduler
 using(user_id=(select health_private.request_user_id()))
 with check(user_id=(select health_private.request_user_id()));

-- ---------------------------------------------------------------------------
-- 5. Private idempotency ledger (no clinical text beyond the response id/version)
-- ---------------------------------------------------------------------------
create table health_private.commands (
 user_id uuid not null,
 request_id uuid not null,
 operation text not null check(length(operation) between 1 and 60),
 payload_hash text not null check(length(payload_hash)=32),
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
grant select,insert,delete on health_private.commands to health_scheduler;
create index health_private_commands_created on health_private.commands(created_at);

-- ===== 02-helpers.sql =====
-- ---------------------------------------------------------------------------
-- 6. Time resolution (JS/SQL parity: nonexistent -> null, ambiguous -> earlier)
-- ---------------------------------------------------------------------------
create or replace function health_private.local_instant(p_date date, p_time time, p_timezone text)
returns timestamptz language plpgsql stable set search_path='' as $body$
declare wall timestamp; off_before interval; off_after interval;
 c1 timestamptz; c2 timestamptz; best timestamptz;
begin
 if p_date is null or p_time is null or p_timezone is null then return null; end if;
 wall := p_date + p_time;
 -- Offsets on the adjacent days expose both sides of a DST transition.
 off_before := ((wall-interval '1 day') at time zone p_timezone)-(wall-interval '1 day');
 off_after := ((wall+interval '1 day') at time zone p_timezone)-(wall+interval '1 day');
 c1 := wall+off_before;
 c2 := wall+off_after;
 -- Round-trip filters nonexistent wall times; two valid instants are
 -- ambiguous and the earlier one wins (parity with the JS engine).
 if (c1 at time zone p_timezone)=wall then best:=c1; end if;
 if (c2 at time zone p_timezone)=wall and (best is null or c2<best) then best:=c2; end if;
 return best;
exception when invalid_parameter_value then
 raise exception 'INVALID_TIMEZONE' using errcode='P0001';
end $body$;
revoke all on function health_private.local_instant(date,time,text) from public,anon,authenticated;
grant execute on function health_private.local_instant(date,time,text) to health_scheduler;

-- ---------------------------------------------------------------------------
-- 7. Bounded slot projection from immutable revisions (no per-slot rows stored)
-- ---------------------------------------------------------------------------
create or replace function health_private.schedule_slots(
 p_user uuid, p_medication uuid, p_from timestamptz, p_to timestamptz)
returns table(schedule_id uuid, scheduled_at timestamptz)
language plpgsql stable set search_path='' as $body$
declare r record; win_start timestamptz; win_end timestamptz;
 n bigint; slot timestamptz; d date; t time;
begin
 if p_user is null or p_medication is null or p_from is null or p_to is null then return; end if;
 if p_to<=p_from then return; end if;
 for r in
  select s.id,s.mode,s.timezone,s.anchor_at,s.interval_minutes,s.local_start_date,
         s.local_times,s.end_exclusive_at,s.effective_from,s.effective_until
  from public.health_medication_schedules s
  where s.user_id=p_user and s.medication_id=p_medication
   and s.effective_from<p_to
   and (s.effective_until is null or s.effective_until>p_from)
  order by s.effective_from,s.revision
 loop
  win_start := greatest(p_from,r.effective_from);
  win_end := least(p_to,coalesce(r.effective_until,'infinity'::timestamptz),
                   coalesce(r.end_exclusive_at,'infinity'::timestamptz));
  continue when win_end<=win_start;
  if r.mode='interval' then
   n := greatest(0, ceil(extract(epoch from (win_start-r.anchor_at))/60.0/r.interval_minutes)::bigint);
   loop
    slot := r.anchor_at + (n*r.interval_minutes)*interval '1 minute';
    exit when slot>=win_end;
    if slot>=win_start then
     schedule_id:=r.id; scheduled_at:=slot; return next;
    end if;
    n:=n+1;
   end loop;
  else
   for d in
    select g::date from generate_series(
     greatest(r.local_start_date,(win_start at time zone r.timezone)::date)::timestamp,
     ((win_end-interval '1 microsecond') at time zone r.timezone)::date::timestamp,
     interval '1 day') g
   loop
    foreach t in array r.local_times loop
     slot := health_private.local_instant(d,t,r.timezone);
     if slot is not null and slot>=win_start and slot<win_end then
      schedule_id:=r.id; scheduled_at:=slot; return next;
     end if;
    end loop;
   end loop;
  end if;
 end loop;
end $body$;
revoke all on function health_private.schedule_slots(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function health_private.schedule_slots(uuid,uuid,timestamptz,timestamptz) to authenticated,health_scheduler;

-- ---------------------------------------------------------------------------
-- 8. Occurrence materialization and budgets
-- ---------------------------------------------------------------------------
create or replace function health_private.assert_budget(
 p_user uuid, p_medication uuid, p_from timestamptz, p_to timestamptz)
returns integer language plpgsql stable set search_path='' as $body$
declare n integer;
begin
 select count(*) into n from health_private.schedule_slots(p_user,p_medication,p_from,p_to);
 if n>1000 then raise exception 'WINDOW_TOO_LARGE' using errcode='P0001'; end if;
 return n;
end $body$;
revoke all on function health_private.assert_budget(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function health_private.assert_budget(uuid,uuid,timestamptz,timestamptz) to authenticated,health_scheduler;

create or replace function health_private.ensure_occurrences(
 p_user uuid, p_medication uuid, p_from timestamptz, p_to timestamptz)
returns integer language plpgsql set search_path='' as $body$
declare n integer;
begin
 perform health_private.assert_budget(p_user,p_medication,p_from,p_to);
 insert into public.health_medication_occurrences(user_id,medication_id,schedule_id,scheduled_at)
 select p_user,p_medication,s.schedule_id,s.scheduled_at
 from health_private.schedule_slots(p_user,p_medication,p_from,p_to) s
 on conflict (user_id,medication_id,scheduled_at) do nothing;
 get diagnostics n=row_count;
 return n;
end $body$;
revoke all on function health_private.ensure_occurrences(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function health_private.ensure_occurrences(uuid,uuid,timestamptz,timestamptz) to health_scheduler;

create or replace function health_private.ensure_occurrences_for_user(
 p_user uuid, p_from timestamptz, p_to timestamptz)
returns integer language plpgsql set search_path='' as $body$
declare n integer:=0; m record; added integer;
begin
 for m in select id from public.health_medications where user_id=p_user loop
  added:=health_private.ensure_occurrences(p_user,m.id,p_from,p_to);
  n:=n+added;
 end loop;
 return n;
end $body$;
revoke all on function health_private.ensure_occurrences_for_user(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function health_private.ensure_occurrences_for_user(uuid,timestamptz,timestamptz) to health_scheduler;

create or replace function health_private.ensure_occurrences_all(p_from timestamptz, p_to timestamptz)
returns integer language plpgsql set search_path='' as $body$
declare n integer:=0; m record; added integer;
begin
 for m in select user_id,id from public.health_medications loop
  added:=health_private.ensure_occurrences(m.user_id,m.id,p_from,p_to);
  n:=n+added;
 end loop;
 return n;
end $body$;
revoke all on function health_private.ensure_occurrences_all(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function health_private.ensure_occurrences_all(timestamptz,timestamptz) to service_role;

create or replace function health_private.slot_schedule(
 p_user uuid, p_medication uuid, p_at timestamptz)
returns uuid language plpgsql stable set search_path='' as $body$
declare sid uuid;
begin
 if p_at is null then return null; end if;
 select s.schedule_id into sid
 from health_private.schedule_slots(p_user,p_medication,p_at,p_at+interval '1 microsecond') s
 where s.scheduled_at=p_at;
 return sid;
end $body$;
revoke all on function health_private.slot_schedule(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function health_private.slot_schedule(uuid,uuid,timestamptz) to health_scheduler;

-- Exact finite total for one revision; null for continuous schedules.
create or replace function health_private.revision_total(p_schedule_id uuid)
returns integer language plpgsql stable set search_path='' as $body$
declare r record; bound_end timestamptz; n_first bigint; n_end bigint; total integer:=0;
 d date; t time; slot timestamptz;
begin
 select id,user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,effective_from,effective_until,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_at,created_by_request_id into r from public.health_medication_schedules where id=p_schedule_id;
 if not found or r.duration_kind='continuous' then return null; end if;
 bound_end:=least(coalesce(r.end_exclusive_at,'infinity'::timestamptz),
                  coalesce(r.effective_until,'infinity'::timestamptz));
 if bound_end='infinity'::timestamptz then return null; end if;
 if r.mode='interval' then
  n_first:=greatest(0,ceil(extract(epoch from (r.effective_from-r.anchor_at))/60.0/r.interval_minutes)::bigint);
  n_end:=greatest(0,ceil(extract(epoch from (bound_end-r.anchor_at))/60.0/r.interval_minutes)::bigint);
  return greatest(0,(n_end-n_first))::integer;
 end if;
 for d in
  select g::date from generate_series(r.local_start_date::timestamp,
   (bound_end at time zone r.timezone)::date::timestamp,interval '1 day') g
 loop
  foreach t in array r.local_times loop
   slot:=health_private.local_instant(d,t,r.timezone);
   if slot is not null and slot>=r.effective_from and slot<bound_end then total:=total+1; end if;
  end loop;
 end loop;
 return total;
end $body$;
revoke all on function health_private.revision_total(uuid) from public,anon,authenticated;
grant execute on function health_private.revision_total(uuid) to authenticated,health_scheduler;

-- ---------------------------------------------------------------------------
-- 9. Idempotency commands (same key+payload returns; different payload fails)
-- ---------------------------------------------------------------------------
create or replace function health_private.command_cached(
 p_user uuid, p_request uuid, p_operation text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare stored record; payload_hash text;
begin
 if p_user is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_request is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_request::text,0));
 payload_hash:=md5(p_payload::text);
 select c.operation,c.payload_hash,c.response into stored
 from health_private.commands c where c.user_id=p_user and c.request_id=p_request;
 if found then
  if stored.operation is distinct from p_operation or stored.payload_hash is distinct from payload_hash then
   raise exception 'IDEMPOTENCY_CONFLICT' using errcode='P0001';
  end if;
  return stored.response;
 end if;
 return null;
end $body$;
revoke all on function health_private.command_cached(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function health_private.command_cached(uuid,uuid,text,jsonb) to health_scheduler;

create or replace function health_private.command_store(
 p_user uuid, p_request uuid, p_operation text, p_payload jsonb, p_response jsonb)
returns void language plpgsql security definer set search_path='' as $body$
begin
 if p_request is null then return; end if;
 insert into health_private.commands(user_id,request_id,operation,payload_hash,response)
 values(p_user,p_request,p_operation,md5(p_payload::text),p_response)
 on conflict (user_id,request_id) do nothing;
end $body$;
revoke all on function health_private.command_store(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function health_private.command_store(uuid,uuid,text,jsonb,jsonb) to health_scheduler;

create or replace function health_private.prune_commands(p_older_than interval default interval '7 days')
returns integer language plpgsql security definer set search_path='' as $body$
declare n integer;
begin
 delete from health_private.commands where created_at<now()-p_older_than;
 get diagnostics n=row_count;
 return n;
end $body$;
revoke all on function health_private.prune_commands(interval) from public,anon,authenticated;
grant execute on function health_private.prune_commands(interval) to service_role;

-- ===== 03-triggers.sql =====
-- ---------------------------------------------------------------------------
-- 10. Revision guard: immutable history + no overlap (serialized per medication)
-- ---------------------------------------------------------------------------
create or replace function health_private.revision_guard() returns trigger
language plpgsql security definer set search_path='' as $body$
declare v_times time[]; t time;
begin
 if health_private.request_user_id() is not null
    and new.user_id is distinct from health_private.request_user_id() then
  raise exception 'ownership required' using errcode='42501';
 end if;
 if not exists(select 1 from pg_timezone_names z where z.name=new.timezone) then
  raise exception 'INVALID_TIMEZONE' using errcode='P0001';
 end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'effective_until') is distinct from (to_jsonb(old)-'effective_until') then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  if new.effective_until is not null and old.effective_until is not null
     and new.effective_until<old.effective_until then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
 end if;
 if new.mode='interval' then
  if new.interval_minutes is null or new.interval_minutes<60 or new.interval_minutes>10080 then
   raise exception 'INVALID_INTERVAL' using errcode='P0001';
  end if;
 else
  if new.local_times is null or cardinality(new.local_times)=0
     or cardinality(new.local_times)>24 then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  if cardinality(new.local_times) <>
     (select count(distinct x) from unnest(new.local_times) x) then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
  select array_agg(x order by x) into v_times from unnest(new.local_times) x;
  if v_times is distinct from new.local_times then
   raise exception 'INVALID_SCHEDULE' using errcode='P0001';
  end if;
 end if;
 if new.duration_kind='finite' then
  if new.duration_days is null or new.duration_days<1 then
   raise exception 'INVALID_DURATION' using errcode='P0001';
  end if;
 end if;
 -- Serialize revision creation per medication, then reject overlap.
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':'||new.medication_id::text,0));
 if exists(
  select 1 from public.health_medication_schedules s
  where s.user_id=new.user_id and s.medication_id=new.medication_id
   and s.id<>new.id
   and s.effective_from<coalesce(new.effective_until,'infinity'::timestamptz)
   and coalesce(s.effective_until,'infinity'::timestamptz)>new.effective_from
 ) then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 -- The exclusive end must be the one implied by the duration.
 if new.duration_kind='finite' then
  if new.mode='interval' then
   if new.end_exclusive_at <> new.anchor_at+make_interval(days=>new.duration_days) then
    raise exception 'INVALID_DURATION' using errcode='P0001';
   end if;
  else
   if new.end_exclusive_at <>
      (((new.local_start_date+new.duration_days)::timestamp) at time zone new.timezone) then
    raise exception 'INVALID_DURATION' using errcode='P0001';
   end if;
  end if;
 end if;
 return new;
end $body$;
revoke all on function health_private.revision_guard() from public,anon,authenticated;
create trigger health_medication_schedules_guard
 before insert or update on public.health_medication_schedules
 for each row execute function health_private.revision_guard();

-- ---------------------------------------------------------------------------
-- 11. Medication row version (optimistic concurrency for every writer)
-- ---------------------------------------------------------------------------
create or replace function health_private.medication_version() returns trigger
language plpgsql security invoker set search_path='' as $body$
begin
 new.row_version:=old.row_version+1;
 return new;
end $body$;
revoke all on function health_private.medication_version() from public,anon,authenticated;
create trigger health_medications_version
 before update on public.health_medications
 for each row execute function health_private.medication_version();

-- ---------------------------------------------------------------------------
-- 12. Legacy compatibility bridge (old clients still write times/timezone)
-- ---------------------------------------------------------------------------
create or replace function health_private.sync_legacy_schedule(
 p_med public.health_medications, p_is_insert boolean)
returns void language plpgsql security definer set search_path='' as $body$
declare v_tz text:=p_med.timezone; v_times time[]; v_now timestamptz:=now();
 v_kind text; v_days integer; v_end timestamptz; v_revision integer; v_effective timestamptz;
 v_pending boolean;
begin
 if health_private.request_user_id() is not null
    and p_med.user_id is distinct from health_private.request_user_id() then
  raise exception 'ownership required' using errcode='42501';
 end if;
 if not exists(select 1 from pg_timezone_names z where z.name=v_tz) then
  raise exception 'INVALID_TIMEZONE' using errcode='P0001';
 end if;
 perform set_config('health.compat_internal','1',true);
 select array_agg(x order by x) into v_times from (select distinct unnest(p_med.times) x) s where x is not null;
 v_pending:=(v_times is null or cardinality(v_times)=0);
 update public.health_medications set schedule_pending=v_pending
  where id=p_med.id and schedule_pending is distinct from v_pending;
 if v_pending or not exists(
  select 1 from public.health_medication_schedules s
  where s.user_id=p_med.user_id and s.medication_id=p_med.id and s.effective_until is null
   and s.mode='daily_times' and s.timezone=v_tz and s.local_start_date=p_med.starts_on
   and s.local_times=v_times
   and s.dose_text_snapshot=p_med.dose
   and s.quantity_snapshot is not distinct from p_med.dose_quantity
   and s.unit_snapshot is not distinct from p_med.dose_unit_code
   and s.duration_kind=(case when p_med.ends_on is null then 'continuous' else 'finite' end)
   and (p_med.ends_on is null or s.duration_days=(p_med.ends_on-p_med.starts_on+1))
 ) then
  update public.health_medication_schedules set effective_until=v_now
   where user_id=p_med.user_id and medication_id=p_med.id
    and (effective_until is null or effective_until>v_now);
  update public.health_medication_occurrences set canceled_at=v_now,cancellation_reason='schedule_changed'
   where user_id=p_med.user_id and medication_id=p_med.id and scheduled_at>=v_now
    and p_med.status<>'active' and canceled_at is null
    and not exists(select 1 from public.health_doses d
      where d.user_id=p_med.user_id and d.medication_id=p_med.id
       and d.scheduled_at=health_medication_occurrences.scheduled_at);
  if not v_pending and p_med.status='active' then
   select coalesce(max(revision),0)+1 into v_revision
    from public.health_medication_schedules
    where user_id=p_med.user_id and medication_id=p_med.id;
   v_kind:=case when p_med.ends_on is null then 'continuous' else 'finite' end;
   v_days:=case when p_med.ends_on is null then null else (p_med.ends_on-p_med.starts_on+1) end;
   v_end:=case when p_med.ends_on is null then null
     else (((p_med.ends_on+1)::timestamp) at time zone v_tz) end;
   v_effective:=case when p_is_insert
     then least(((p_med.starts_on::timestamp) at time zone v_tz),v_now)
     else v_now end;
   insert into public.health_medication_schedules(
    user_id,medication_id,revision,mode,timezone,local_start_date,local_times,
    duration_kind,duration_days,end_exclusive_at,effective_from,
    dose_text_snapshot,quantity_snapshot,unit_snapshot)
   values(p_med.user_id,p_med.id,v_revision,'daily_times',v_tz,p_med.starts_on,v_times,
    v_kind,v_days,v_end,v_effective,
    p_med.dose,p_med.dose_quantity,p_med.dose_unit_code);
  end if;
 end if;
 if p_med.status='active' and p_med.reminders_enabled and not v_pending then
  perform health_private.ensure_occurrences(p_med.user_id,p_med.id,v_now,v_now+interval '14 days');
  insert into public.health_reminders(user_id,medication_id,scheduled_at,offset_minutes,remind_at)
  select o.user_id,o.medication_id,o.scheduled_at,p_med.reminder_offset_minutes,
         o.scheduled_at-make_interval(mins=>p_med.reminder_offset_minutes)
  from public.health_medication_occurrences o
  where o.user_id=p_med.user_id and o.medication_id=p_med.id and o.canceled_at is null
   and o.scheduled_at>=v_now and o.scheduled_at<v_now+interval '14 days'
   and o.scheduled_at-make_interval(mins=>p_med.reminder_offset_minutes)>=v_now
   and not exists(select 1 from public.health_doses d
     where d.user_id=o.user_id and d.medication_id=o.medication_id and d.scheduled_at=o.scheduled_at)
  on conflict do nothing;
 else
  update public.health_reminders set dismissed_at=v_now
   where user_id=p_med.user_id and medication_id=p_med.id
    and scheduled_at>=v_now and dismissed_at is null;
  update public.health_medication_occurrences
   set canceled_at=v_now,
       cancellation_reason=case when p_med.status='paused' then 'paused' else 'finished' end
   where user_id=p_med.user_id and medication_id=p_med.id and scheduled_at>=v_now
    and p_med.status<>'active' and canceled_at is null
    and not exists(select 1 from public.health_doses d
      where d.user_id=p_med.user_id and d.medication_id=p_med.id
       and d.scheduled_at=health_medication_occurrences.scheduled_at);
 end if;
 perform set_config('health.compat_internal','',true);
end $body$;
revoke all on function health_private.sync_legacy_schedule(public.health_medications,boolean) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 13. Dose audit and legacy occurrence binding (all writers, including old UI)
-- ---------------------------------------------------------------------------
create or replace function health_private.dose_audit_before() returns trigger
language plpgsql security definer set search_path='' as $body$
declare sid uuid;
begin
 if health_private.request_user_id() is not null
    and new.user_id is distinct from health_private.request_user_id() then
  raise exception 'ownership required' using errcode='42501';
 end if;
 if tg_op='UPDATE' then
  if new.medication_id is distinct from old.medication_id
     or new.scheduled_at is distinct from old.scheduled_at
     or new.occurrence_id is distinct from old.occurrence_id then
   raise exception 'dose schedule is immutable' using errcode='22023';
  end if;
  new.row_version:=old.row_version+1;
  new.updated_at:=now();
 end if;
 if new.status='taken' and new.taken_at>now()+interval '5 seconds' then
  raise exception 'FUTURE_TAKEN_AT' using errcode='P0001';
 end if;
 if new.occurrence_id is null then
  sid:=health_private.slot_schedule(new.user_id,new.medication_id,new.scheduled_at);
  if sid is not null then
   insert into public.health_medication_occurrences(user_id,medication_id,schedule_id,scheduled_at)
   values(new.user_id,new.medication_id,sid,new.scheduled_at)
   on conflict (user_id,medication_id,scheduled_at) do nothing;
   select id into new.occurrence_id from public.health_medication_occurrences
    where user_id=new.user_id and medication_id=new.medication_id and scheduled_at=new.scheduled_at;
  end if;
 end if;
 if new.occurrence_id is not null then
  update public.health_medication_occurrences set record_version=greatest(record_version,case when tg_op='UPDATE' then old.row_version else 0 end)+1
   where user_id=new.user_id and id=new.occurrence_id
   returning record_version into new.row_version;
 elsif tg_op='INSERT' then new.row_version:=1; end if;
 return new;
end $body$;
revoke all on function health_private.dose_audit_before() from public,anon,authenticated;
create trigger health_doses_audit_before
 before insert or update on public.health_doses
 for each row execute function health_private.dose_audit_before();

create or replace function health_private.dose_audit_after() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 insert into public.health_dose_events(
  user_id,medication_id,occurrence_id,action,status,scheduled_at,taken_at,amount,reason,
  actor_user_id,request_id)
 values(new.user_id,new.medication_id,new.occurrence_id,
  case when tg_op='INSERT' then new.status else 'updated' end,
  new.status,new.scheduled_at,new.taken_at,new.amount,nullif(new.reason,''),
  health_private.request_user_id(),
  nullif(current_setting('health.request_id',true),'')::uuid);
 return new;
end $body$;
revoke all on function health_private.dose_audit_after() from public,anon,authenticated;
create trigger health_doses_audit_after
 after insert or update on public.health_doses
 for each row execute function health_private.dose_audit_after();

create or replace function health_private.dose_audit_delete() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if health_private.request_user_id() is not null
    and old.user_id is distinct from health_private.request_user_id() then
  raise exception 'ownership required' using errcode='42501';
 end if;
 -- Definitive parent/account deletion cascades its audit too; do not insert
 -- an undo event referencing the parent that has already been deleted.
 if not exists(select 1 from public.health_medications
   where id=old.medication_id and user_id=old.user_id) then return old; end if;
 insert into public.health_dose_events(
  user_id,medication_id,occurrence_id,action,status,scheduled_at,taken_at,amount,reason,
  actor_user_id,request_id)
 values(old.user_id,old.medication_id,old.occurrence_id,'undone',old.status,old.scheduled_at,
  old.taken_at,old.amount,nullif(old.reason,''),health_private.request_user_id(),
  nullif(current_setting('health.request_id',true),'')::uuid);
 if old.occurrence_id is not null then
  update public.health_medication_occurrences set record_version=record_version+1
   where user_id=old.user_id and id=old.occurrence_id;
 end if;
 return old;
end $body$;
revoke all on function health_private.dose_audit_delete() from public,anon,authenticated;
create trigger health_doses_audit_delete
 before delete on public.health_doses
 for each row execute function health_private.dose_audit_delete();

-- ---------------------------------------------------------------------------
-- 14. Scheduler trigger: medication branch now follows revisions/occurrences
-- ---------------------------------------------------------------------------
create or replace function health_private.schedule_record() returns trigger
language plpgsql security definer set search_path='' as $body$
declare d date; tm time; occurrence timestamptz; minutes integer;
begin
 if coalesce(current_setting('health.migration_backfill',true),'')='1'
    and session_user in ('postgres','supabase_admin') then return new; end if;
 if new.user_id is distinct from health_private.request_user_id() then
  raise exception 'ownership required' using errcode='42501';
 end if;
 if tg_table_name='health_medications' then
  if coalesce(current_setting('health.schedule_api',true),'')<>'1'
     and coalesce(current_setting('health.compat_internal',true),'')<>'1' then
   perform health_private.sync_legacy_schedule(new,tg_op='INSERT');
  end if;
 elsif tg_table_name='health_appointments' then
  delete from public.health_reminders where user_id=new.user_id and appointment_id=new.id and dismissed_at is null;
  if new.status='scheduled' then
   foreach minutes in array new.reminder_minutes loop
    if new.starts_at-make_interval(mins=>minutes)>now() then
     insert into public.health_reminders(user_id,appointment_id,scheduled_at,offset_minutes,remind_at)
     values(new.user_id,new.id,new.starts_at,minutes,new.starts_at-make_interval(mins=>minutes))
     on conflict do nothing;
    end if;
   end loop;
  end if;
 elsif tg_table_name='health_exams' then
  delete from public.health_reminders where user_id=new.user_id and exam_id=new.id and dismissed_at is null;
  if new.status='scheduled' and new.performed_at is not null then
   foreach minutes in array new.reminder_minutes loop
    if new.performed_at-make_interval(mins=>minutes)>now() then
     insert into public.health_reminders(user_id,exam_id,scheduled_at,offset_minutes,remind_at)
     values(new.user_id,new.id,new.performed_at,minutes,new.performed_at-make_interval(mins=>minutes))
     on conflict do nothing;
    end if;
   end loop;
  end if;
 end if;
 return new;
end $body$;

-- ===== 04a-save-state.sql =====
-- ---------------------------------------------------------------------------
-- 15. Treatment save (create/edit -> new immutable revision)
-- ---------------------------------------------------------------------------
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
  'canceled_occurrences',v_canceled,'schedule_id',v_sched,
  'next_occurrences',coalesce((
   select jsonb_agg(x.scheduled_at order by x.scheduled_at)
   from (select s.scheduled_at from health_private.schedule_slots(uid,v_id,now(),now()+interval '8 days') s
         order by s.scheduled_at limit 5) x),'[]'::jsonb));
 perform health_private.command_store(uid,p_request_id,'treatment_save',p_payload,v_cached);
 return v_cached;
end $body$;
revoke all on function public.health_treatment_save(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.health_treatment_save(jsonb,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 16. Pause / resume / finish (atomic cut of the future, history preserved)
-- ---------------------------------------------------------------------------
create or replace function public.health_treatment_state(
 p_medication_id uuid,
 p_action text,
 p_effective_at timestamptz default null,
 p_expected_version bigint default null,
 p_reason text default '',
 p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare uid uuid:=health_private.request_user_id(); v_med public.health_medications%rowtype;
 v_cached jsonb; v_payload jsonb; v_at timestamptz; v_latest public.health_medication_schedules%rowtype;
 v_revision integer; v_sched uuid; v_canceled integer:=0; v_version bigint;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_action not in ('pause','resume','finish') then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_payload:=jsonb_build_object('medication_id',p_medication_id,'action',p_action,
  'effective_at',p_effective_at,'expected_version',p_expected_version,
  'reason',coalesce(p_reason,''));
 v_cached:=health_private.command_cached(uid,p_request_id,'treatment_state',v_payload);
 if v_cached is not null then return v_cached; end if;
 select id,user_id,name,dose,status,starts_on,ends_on,times,timezone,reminders_enabled,notes,condition_id,appointment_id,created_at,name_search,presentation_code,dose_quantity,dose_unit_code,professional_name,indication,pharmacy,batch,finished_at,finish_reason,paused_at,row_version,reminder_offset_minutes,schedule_pending into v_med from public.health_medications
  where id=p_medication_id and user_id=uid for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
 if p_expected_version is not null and v_med.row_version<>p_expected_version then
  raise exception 'VERSION_CONFLICT' using errcode='P0001';
 end if;
 v_at:=greatest(coalesce(p_effective_at,now()),now());
 if p_reason is not null and length(p_reason)>1000 then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 if p_action='pause' then
  if v_med.status='finished' then raise exception 'INVALID_SCHEDULE' using errcode='P0001'; end if;
  if v_med.status<>'paused' then
   perform health_private.ensure_occurrences(uid,p_medication_id,v_at,v_at+interval '14 days');
   update public.health_medication_schedules set effective_until=v_at
    where user_id=uid and medication_id=p_medication_id
     and (effective_until is null or effective_until>v_at);
   update public.health_medication_occurrences
    set canceled_at=v_at,cancellation_reason='paused'
    where user_id=uid and medication_id=p_medication_id and scheduled_at>=v_at
     and canceled_at is null
     and not exists(select 1 from public.health_doses d
       where d.user_id=uid and d.medication_id=p_medication_id
        and d.scheduled_at=health_medication_occurrences.scheduled_at);
   get diagnostics v_canceled=row_count;
   perform set_config('health.schedule_api','1',true);
   update public.health_medications set status='paused',paused_at=v_at
    where id=p_medication_id and user_id=uid returning row_version into v_version;
   perform set_config('health.schedule_api','',true);
   update public.health_reminders set dismissed_at=now()
    where user_id=uid and medication_id=p_medication_id
     and scheduled_at>=v_at and dismissed_at is null;
  else
   select row_version into v_version from public.health_medications where id=p_medication_id;
  end if;
 elsif p_action='resume' then
  if v_med.status<>'paused' then
   if v_med.status='active' then
    select row_version into v_version from public.health_medications where id=p_medication_id;
   else
    raise exception 'INVALID_SCHEDULE' using errcode='P0001';
   end if;
  else
   select id,user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,effective_from,effective_until,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_at,created_by_request_id into v_latest from public.health_medication_schedules
    where user_id=uid and medication_id=p_medication_id
    order by effective_from desc,revision desc limit 1;
   if not found then raise exception 'INVALID_SCHEDULE' using errcode='P0001'; end if;
   if v_latest.end_exclusive_at is not null and v_latest.end_exclusive_at<=v_at then
    raise exception 'RESUME_EXPIRED' using errcode='P0001';
   end if;
   select coalesce(max(revision),0)+1 into v_revision
    from public.health_medication_schedules
    where user_id=uid and medication_id=p_medication_id;
   insert into public.health_medication_schedules(
    user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,
    local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,
    effective_from,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_by_request_id)
   values(uid,p_medication_id,v_revision,v_latest.mode,v_latest.timezone,v_latest.anchor_at,
    v_latest.interval_minutes,v_latest.local_start_date,v_latest.local_times,
    v_latest.duration_kind,v_latest.duration_days,v_latest.end_exclusive_at,
    v_at,v_med.dose,v_med.dose_quantity,v_med.dose_unit_code,p_request_id)
   returning id into v_sched;
   -- Occurrences canceled by pause at times the cloned revision still plans.
   update public.health_medication_occurrences o
    set canceled_at=null,cancellation_reason=null,schedule_id=v_sched
    where o.user_id=uid and o.medication_id=p_medication_id
     and o.canceled_at is not null and o.cancellation_reason in ('paused','schedule_changed')
     and o.scheduled_at>=v_at and o.scheduled_at<v_at+interval '14 days'
     and exists(select 1 from health_private.schedule_slots(
       uid,p_medication_id,v_at,v_at+interval '14 days') s
       where s.scheduled_at=o.scheduled_at);
   perform set_config('health.schedule_api','1',true);
   update public.health_medications set status='active',paused_at=null
    where id=p_medication_id and user_id=uid returning row_version into v_version;
   perform set_config('health.schedule_api','',true);
   if v_med.reminders_enabled then
    perform health_private.ensure_occurrences(uid,p_medication_id,v_at,v_at+interval '14 days');
    insert into public.health_reminders(user_id,medication_id,scheduled_at,offset_minutes,remind_at)
    select o.user_id,o.medication_id,o.scheduled_at,v_med.reminder_offset_minutes,
           o.scheduled_at-make_interval(mins=>v_med.reminder_offset_minutes)
    from public.health_medication_occurrences o
    where o.user_id=uid and o.medication_id=p_medication_id and o.canceled_at is null
     and o.scheduled_at>=now() and o.scheduled_at<now()+interval '14 days'
     and o.scheduled_at-make_interval(mins=>v_med.reminder_offset_minutes)>=now()
     and not exists(select 1 from public.health_doses d
       where d.user_id=o.user_id and d.medication_id=o.medication_id and d.scheduled_at=o.scheduled_at)
    on conflict (user_id,medication_id,scheduled_at) where medication_id is not null
  do update set offset_minutes=excluded.offset_minutes,remind_at=excluded.remind_at,
    dismissed_at=null,claimed_until=null
  where public.health_reminders.delivered_at is null and excluded.remind_at>=now();
   end if;
  end if;
 else
  if v_med.status<>'finished' then
   if exists(select 1 from public.health_medication_schedules s
     where s.user_id=uid and s.medication_id=p_medication_id and s.effective_from>=v_at) then
    raise exception 'INVALID_SCHEDULE' using errcode='P0001';
   end if;
   perform health_private.ensure_occurrences(uid,p_medication_id,v_at,v_at+interval '14 days');
   update public.health_medication_schedules set effective_until=v_at
    where user_id=uid and medication_id=p_medication_id
     and (effective_until is null or effective_until>v_at);
   update public.health_medication_occurrences
    set canceled_at=v_at,cancellation_reason='finished'
    where user_id=uid and medication_id=p_medication_id and scheduled_at>=v_at
     and canceled_at is null
     and not exists(select 1 from public.health_doses d
       where d.user_id=uid and d.medication_id=p_medication_id
        and d.scheduled_at=health_medication_occurrences.scheduled_at);
   get diagnostics v_canceled=row_count;
   perform set_config('health.schedule_api','1',true);
   update public.health_medications
    set status='finished',finished_at=v_at,finish_reason=coalesce(p_reason,'')
    where id=p_medication_id and user_id=uid returning row_version into v_version;
   perform set_config('health.schedule_api','',true);
   update public.health_reminders set dismissed_at=now()
    where user_id=uid and medication_id=p_medication_id
     and scheduled_at>=v_at and dismissed_at is null;
  else
   select row_version into v_version from public.health_medications where id=p_medication_id;
  end if;
 end if;
 v_cached:=jsonb_build_object('id',p_medication_id,'status',
  (select status from public.health_medications where id=p_medication_id),
  'row_version',v_version,'canceled_occurrences',v_canceled,'effective_at',v_at);
 perform health_private.command_store(uid,p_request_id,'treatment_state',v_payload,v_cached);
 return v_cached;
end $body$;
revoke all on function public.health_treatment_state(uuid,text,timestamptz,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.health_treatment_state(uuid,text,timestamptz,bigint,text,uuid) to authenticated;

-- ===== 04b-doses.sql =====
-- ---------------------------------------------------------------------------
-- 17. Record / correct a dose (occurrence identity is validated server-side)
-- ---------------------------------------------------------------------------
create or replace function public.health_dose_record(
 p_medication_id uuid,
 p_scheduled_at timestamptz,
 p_status text,
 p_taken_at timestamptz default null,
 p_amount text default '',
 p_reason text default '',
 p_expected_version bigint default 0,
 p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare uid uuid:=health_private.request_user_id(); v_cached jsonb; v_payload jsonb;
 v_med public.health_medications%rowtype; v_sid uuid; v_occ uuid; v_dose public.health_doses%rowtype;
 v_id uuid; v_version bigint; v_taken timestamptz:=p_taken_at;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_status not in ('taken','skipped') then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 if p_medication_id is null or p_scheduled_at is null then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 v_payload:=jsonb_build_object('medication_id',p_medication_id,'scheduled_at',p_scheduled_at,
  'status',p_status,'taken_at',p_taken_at,'amount',coalesce(p_amount,''),
  'reason',coalesce(p_reason,''),'expected_version',coalesce(p_expected_version,0));
 v_cached:=health_private.command_cached(uid,p_request_id,'dose_record',v_payload);
 if v_cached is not null then return v_cached; end if;
 if p_status='taken' then
  if v_taken is null then raise exception 'INVALID_SCHEDULE' using errcode='P0001'; end if;
  if v_taken>now()+interval '5 seconds' then
   raise exception 'FUTURE_TAKEN_AT' using errcode='P0001';
  end if;
 else
  v_taken:=null;
 end if;
 if length(coalesce(p_amount,''))>255 or length(coalesce(p_reason,''))>1000 then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 if p_scheduled_at>now()+interval '5 seconds' then
  raise exception 'FUTURE_OCCURRENCE' using errcode='P0001';
 end if;
 select id,user_id,name,dose,status,starts_on,ends_on,times,timezone,reminders_enabled,notes,condition_id,appointment_id,created_at,name_search,presentation_code,dose_quantity,dose_unit_code,professional_name,indication,pharmacy,batch,finished_at,finish_reason,paused_at,row_version,reminder_offset_minutes,schedule_pending into v_med from public.health_medications
  where id=p_medication_id and user_id=uid for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
 v_sid:=health_private.slot_schedule(uid,p_medication_id,p_scheduled_at);
 if v_sid is null then
  raise exception 'OCCURRENCE_NOT_SCHEDULED' using errcode='P0001';
 end if;
 insert into public.health_medication_occurrences(user_id,medication_id,schedule_id,scheduled_at)
 values(uid,p_medication_id,v_sid,p_scheduled_at)
 on conflict (user_id,medication_id,scheduled_at) do nothing;
 select id into v_occ from public.health_medication_occurrences
  where user_id=uid and medication_id=p_medication_id and scheduled_at=p_scheduled_at;
 perform set_config('health.request_id',coalesce(p_request_id::text,''),true);
 select id,user_id,medication_id,scheduled_at,taken_at,status,amount,created_at,occurrence_id,row_version,reason,updated_at into v_dose from public.health_doses
  where user_id=uid and medication_id=p_medication_id and scheduled_at=p_scheduled_at
  for update;
 if found then
  if v_dose.row_version<>coalesce(p_expected_version,0) then
   raise exception 'VERSION_CONFLICT' using errcode='P0001';
  end if;
  update public.health_doses
   set status=p_status,taken_at=v_taken,amount=coalesce(p_amount,''),reason=coalesce(p_reason,'')
   where id=v_dose.id and user_id=uid and row_version=coalesce(p_expected_version,0)
   returning id,row_version into v_id,v_version;
  if v_id is null then raise exception 'VERSION_CONFLICT' using errcode='P0001'; end if;
 else
  if coalesce(p_expected_version,0)<>0 then
   raise exception 'VERSION_CONFLICT' using errcode='P0001';
  end if;
  insert into public.health_doses(
   user_id,medication_id,occurrence_id,scheduled_at,taken_at,status,amount,reason)
  values(uid,p_medication_id,v_occ,p_scheduled_at,v_taken,p_status,
   coalesce(p_amount,''),coalesce(p_reason,''))
  returning id,row_version into v_id,v_version;
 end if;
 perform set_config('health.request_id','',true);
 v_cached:=jsonb_build_object('dose_id',v_id,'occurrence_id',v_occ,'status',p_status,
  'row_version',v_version,'server_now',now());
 perform health_private.command_store(uid,p_request_id,'dose_record',v_payload,v_cached);
 return v_cached;
end $body$;
revoke all on function public.health_dose_record(uuid,timestamptz,text,timestamptz,text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.health_dose_record(uuid,timestamptz,text,timestamptz,text,text,bigint,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 18. Undo: delete current projection only; the audit trigger keeps the event
-- ---------------------------------------------------------------------------
create or replace function public.health_dose_undo(
 p_medication_id uuid,
 p_scheduled_at timestamptz,
 p_expected_version bigint,
 p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare uid uuid:=health_private.request_user_id(); v_cached jsonb; v_payload jsonb;
 v_dose public.health_doses%rowtype;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 v_payload:=jsonb_build_object('medication_id',p_medication_id,'scheduled_at',p_scheduled_at,
  'expected_version',coalesce(p_expected_version,0));
 v_cached:=health_private.command_cached(uid,p_request_id,'dose_undo',v_payload);
 if v_cached is not null then return v_cached; end if;
 perform 1 from public.health_medications
  where id=p_medication_id and user_id=uid for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
 select id,user_id,medication_id,scheduled_at,taken_at,status,amount,created_at,occurrence_id,row_version,reason,updated_at into v_dose from public.health_doses
  where user_id=uid and medication_id=p_medication_id and scheduled_at=p_scheduled_at
  for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001'; end if;
 if v_dose.row_version<>coalesce(p_expected_version,0) then
  raise exception 'VERSION_CONFLICT' using errcode='P0001';
 end if;
 perform set_config('health.request_id',coalesce(p_request_id::text,''),true);
 delete from public.health_doses where id=v_dose.id and user_id=uid;
 perform set_config('health.request_id','',true);
 v_cached:=jsonb_build_object('undone',true,'occurrence_id',v_dose.occurrence_id,
  'scheduled_at',p_scheduled_at,'server_now',now());
 perform health_private.command_store(uid,p_request_id,'dose_undo',v_payload,v_cached);
 return v_cached;
end $body$;
revoke all on function public.health_dose_undo(uuid,timestamptz,bigint,uuid) from public,anon,authenticated;
grant execute on function public.health_dose_undo(uuid,timestamptz,bigint,uuid) to authenticated;

-- ===== 04c-read.sql =====
-- ---------------------------------------------------------------------------
-- 19. List projection (20 rows, explicit columns, bounded windows)
-- ---------------------------------------------------------------------------
create or replace function public.health_treatment_list(
 p_group text default 'active', p_prefix text default '',
 p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); v_limit integer:=least(greatest(coalesce(p_limit,20),1),20);
 v_offset integer:=greatest(coalesce(p_offset,0),0); v_prefix text:=lower(trim(coalesce(p_prefix,'')));
 v_rows jsonb:='[]'::jsonb; m record; r record; v_start timestamptz; v_end timestamptz;
 v_next timestamptz; v_planned integer; v_taken integer; v_skipped integer; v_overdue integer;
 v_total integer; v_taken_total integer; v_has_more boolean;
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
  v_planned:=0; v_taken:=0; v_skipped:=0; v_overdue:=0; v_next:=null; v_total:=null;
  if found then
   v_start:=((now() at time zone r.timezone)::date::timestamp) at time zone r.timezone;
   v_end:=(((now() at time zone r.timezone)::date+1)::timestamp) at time zone r.timezone;
   select count(*),
    count(*) filter (where d.status='taken'),
    count(*) filter (where d.status='skipped'),
    count(*) filter (where d.id is null and s.scheduled_at<=now())
   into v_planned,v_taken,v_skipped,v_overdue
   from health_private.schedule_slots(uid,m.id,v_start,v_end) s
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
     'skipped',v_skipped,'overdue',v_overdue),
   'next_at',v_next,'total_predicted',v_total,'taken_total',v_taken_total);
 end loop;
 return jsonb_build_object('rows',v_rows,'has_more',v_has_more);
end $body$;
revoke all on function public.health_treatment_list(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.health_treatment_list(text,text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 20. Dashboard (today + overdue + next, one declared display timezone)
-- ---------------------------------------------------------------------------
create or replace function public.health_treatment_dashboard(p_timezone text default 'UTC')
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); v_start timestamptz; v_end timestamptz;
 v_result jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then
  raise exception 'INVALID_TIMEZONE' using errcode='P0001';
 end if;
 v_start:=((now() at time zone p_timezone)::date::timestamp) at time zone p_timezone;
 v_end:=(((now() at time zone p_timezone)::date+1)::timestamp) at time zone p_timezone;
 with medications as materialized (
  select id,name,dose,status from public.health_medications
  where user_id=uid and status in ('active','paused')
 ), slots as materialized (
  select m.id medication_id,m.name,m.dose,s.scheduled_at,d.id dose_id,d.status,d.row_version
  from medications m
  cross join lateral health_private.schedule_slots(uid,m.id,v_start,v_end) s
  left join public.health_doses d on d.user_id=uid and d.medication_id=m.id
   and d.scheduled_at=s.scheduled_at
 ), next_slot as (
  select m.id medication_id,m.name,m.dose,s.scheduled_at
  from medications m
  cross join lateral health_private.schedule_slots(uid,m.id,now(),now()+interval '8 days') s
  where m.status='active' order by s.scheduled_at,m.id limit 1
 )
 select jsonb_build_object('timezone',p_timezone,'server_now',now(),
  'active_count',(select count(*) from medications where status='active'),
  'continuous_count',(select count(distinct s.medication_id) from public.health_medication_schedules s
    join medications m on m.id=s.medication_id where s.user_id=uid and m.status='active'
     and s.effective_until is null and s.duration_kind='continuous'),
  'today',jsonb_build_object('planned',count(*),
   'taken',count(*) filter(where status='taken'),
   'skipped',count(*) filter(where status='skipped'),
   'overdue',count(*) filter(where dose_id is null and scheduled_at<=now())),
  'next',(select jsonb_build_object('medication_id',medication_id,'name',name,
    'dose',dose,'scheduled_at',scheduled_at) from next_slot),
  'doses',coalesce(jsonb_agg(jsonb_build_object('medication_id',medication_id,
    'name',name,'dose',dose,'scheduled_at',scheduled_at,
    'status',coalesce(status,case when scheduled_at<=now() then 'missed' else 'scheduled' end),
    'record_version',coalesce(row_version,0)) order by scheduled_at,medication_id),'[]'::jsonb))
 into v_result from slots;
 return v_result;
end $body$;
revoke all on function public.health_treatment_dashboard(text) from public,anon,authenticated;
grant execute on function public.health_treatment_dashboard(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 21. Detail projection (summary, today, next slots, bounded regularity)
-- ---------------------------------------------------------------------------
create or replace function health_private.last_slot(p_schedule_id uuid)
returns timestamptz language plpgsql stable set search_path='' as $body$
declare r record; total integer; d date; t time; slot timestamptz; candidate timestamptz;
begin
 select id,user_id,medication_id,revision,mode,timezone,anchor_at,interval_minutes,local_start_date,local_times,duration_kind,duration_days,end_exclusive_at,effective_from,effective_until,dose_text_snapshot,quantity_snapshot,unit_snapshot,created_at,created_by_request_id into r from public.health_medication_schedules where id=p_schedule_id;
 if not found then return null; end if;
 total:=health_private.revision_total(p_schedule_id);
 if r.mode='interval' then
  if total is null or total<1 then return null; end if;
  return r.anchor_at+((greatest(0,ceil(extract(epoch from (r.effective_from-r.anchor_at))/60.0/r.interval_minutes)::bigint)+total-1)*r.interval_minutes)*interval '1 minute';
 end if;
 for d in select g::date from generate_series(
   greatest(r.local_start_date,((coalesce(r.end_exclusive_at,r.effective_from+interval '1 day')-interval '1 microsecond') at time zone r.timezone)::date)::timestamp,
   r.local_start_date::timestamp,interval '-1 day') g
 loop
  foreach t in array r.local_times loop
   candidate:=health_private.local_instant(d,t,r.timezone);
   if candidate is not null and candidate>=r.effective_from
      and (r.effective_until is null or candidate<r.effective_until)
      and (r.end_exclusive_at is null or candidate<r.end_exclusive_at) then
    slot:=candidate;
   end if;
  end loop;
  if slot is not null then return slot; end if;
 end loop;
 return null;
end $body$;
revoke all on function health_private.last_slot(uuid) from public,anon,authenticated;
grant execute on function health_private.last_slot(uuid) to authenticated,health_scheduler;

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
   'taken_at',d.taken_at,'amount',d.amount,'planned_amount',revision.dose_text_snapshot)
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
revoke all on function public.health_treatment_detail(uuid) from public,anon,authenticated;
grant execute on function public.health_treatment_detail(uuid) to authenticated;

-- ===== 04d-calendar.sql =====
-- ---------------------------------------------------------------------------
-- 19b. Calendar projection: bounded window (<=42 local days, <=1000 slots)
-- ---------------------------------------------------------------------------
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
    'amount',coalesce(x.amount,''),'planned_amount',x.planned_amount)
    order by x.scheduled_at) as slots
  from (
   select s.scheduled_at,
    (s.scheduled_at at time zone v_tz)::date as local_date,
    case when d.id is null then
      case when s.scheduled_at<=now() then 'missed' else 'scheduled' end
      else d.status end as status,
    d.id as dose_id,d.row_version,d.taken_at,d.amount,revision.dose_text_snapshot as planned_amount
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
revoke all on function public.health_treatment_calendar(uuid,date,date) from public,anon,authenticated;
grant execute on function public.health_treatment_calendar(uuid,date,date) to authenticated;

-- ===== 04e-history.sql =====
-- ---------------------------------------------------------------------------
-- 19c. History projection: cursor page over bounded windows (14 days each)
--      Planned slots are projected arithmetically; canceled occurrences are
--      merged so a revision change does not erase what had been planned.
-- ---------------------------------------------------------------------------
create or replace function public.health_treatment_history(
 p_medication_id uuid,
 p_filter text default 'all',
 p_cursor_at timestamptz default null,
 p_cursor_id uuid default null,
 p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $body$
declare uid uuid:=(select auth.uid()); v_tz text; v_earliest timestamptz;
 v_limit integer:=least(greatest(coalesce(p_limit,20),1),20);
 v_upper timestamptz; v_lower timestamptz; v_i integer; v_page jsonb; v_rows jsonb:='[]'::jsonb;
 v_rows_sorted jsonb:='[]'::jsonb; v_count integer:=0; v_has_more boolean:=false;
 v_next timestamptz; v_events jsonb:='[]'::jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 if p_filter not in ('all','taken','skipped','missed','canceled','recorded','scheduled') then
  raise exception 'INVALID_SCHEDULE' using errcode='P0001';
 end if;
 if not exists(select 1 from public.health_medications
   where id=p_medication_id and user_id=uid) then
  raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode='P0001';
 end if;
 select s.timezone into v_tz
 from public.health_medication_schedules s
 where s.user_id=uid and s.medication_id=p_medication_id
 order by s.effective_from desc,s.revision desc limit 1;
 v_tz:=coalesce(v_tz,'UTC');
 select min(s.effective_from) into v_earliest
 from public.health_medication_schedules s
 where s.user_id=uid and s.medication_id=p_medication_id;
 select least(coalesce(v_earliest,'infinity'::timestamptz),min(scheduled_at)) into v_earliest
  from public.health_doses where user_id=uid and medication_id=p_medication_id;
 v_upper:=coalesce(p_cursor_at,case when p_filter='scheduled' then now()+interval '8 days' else now()+interval '1 microsecond' end);
 -- At most 672 projected slots per call (2 x 14 x 24); sparse filters return a continuation cursor.
 for v_i in 1..2 loop
  v_lower:=v_upper-interval '14 days';
  with slots as materialized (
   select s.scheduled_at,s.schedule_id
   from health_private.schedule_slots(uid,p_medication_id,v_lower,v_upper) s
   where (p_filter='scheduled' and s.scheduled_at>now())
      or (p_filter<>'scheduled' and s.scheduled_at<=now())
  ), rows as (
   select s.scheduled_at,o.id as occurrence_id,o.canceled_at,o.cancellation_reason,
    d.id as dose_id,d.status as dose_status,d.row_version,d.taken_at,d.amount,d.reason,
    case when d.id is not null then d.status
         when s.scheduled_at<=now() then 'missed' else 'scheduled' end as status,revision.dose_text_snapshot as planned_amount
   from slots s
   join public.health_medication_schedules revision on revision.user_id=uid and revision.id=s.schedule_id
   left join public.health_medication_occurrences o
    on o.user_id=uid and o.medication_id=p_medication_id and o.scheduled_at=s.scheduled_at
   left join public.health_doses d
    on d.user_id=uid and d.medication_id=p_medication_id and d.scheduled_at=s.scheduled_at
   union all
   select o2.scheduled_at,o2.id,o2.canceled_at,o2.cancellation_reason,
    d2.id,d2.status,d2.row_version,d2.taken_at,d2.amount,d2.reason,
    'canceled',revision2.dose_text_snapshot
   from public.health_medication_occurrences o2
   join public.health_medication_schedules revision2 on revision2.user_id=uid and revision2.id=o2.schedule_id
   left join public.health_doses d2
    on d2.user_id=uid and d2.medication_id=p_medication_id and d2.scheduled_at=o2.scheduled_at
   where o2.user_id=uid and o2.medication_id=p_medication_id
    and o2.canceled_at is not null
    and o2.scheduled_at>=v_lower and o2.scheduled_at<v_upper
    and not exists(select 1 from slots s2 where s2.scheduled_at=o2.scheduled_at)
   union all
   select d3.scheduled_at,d3.occurrence_id,null::timestamptz,null::text,
    d3.id,d3.status,d3.row_version,d3.taken_at,d3.amount,d3.reason,d3.status,null::text
   from public.health_doses d3
   where d3.user_id=uid and d3.medication_id=p_medication_id
    and d3.scheduled_at>=v_lower and d3.scheduled_at<v_upper
    and not exists(select 1 from slots s3 where s3.scheduled_at=d3.scheduled_at)
    and not exists(select 1 from public.health_medication_occurrences o3
      where o3.user_id=uid and o3.medication_id=p_medication_id
       and o3.scheduled_at=d3.scheduled_at and o3.canceled_at is not null)
  )
  select coalesce(jsonb_agg(x.obj order by x.scheduled_at desc),'[]'::jsonb)
  into v_page
  from (
   select jsonb_build_object(
    'scheduled_at',q.scheduled_at,'occurrence_id',q.occurrence_id,
    'status',q.status,'dose_id',q.dose_id,'record_version',coalesce(q.row_version,0),
    'taken_at',q.taken_at,'amount',coalesce(q.amount,''),'planned_amount',q.planned_amount,'reason',coalesce(q.reason,''),
    'canceled_at',q.canceled_at,'cancellation_reason',q.cancellation_reason) as obj,
    q.scheduled_at
   from rows q
   where p_filter='all'
    or (p_filter='recorded' and q.status in ('taken','skipped'))
    or q.status=p_filter
   order by q.scheduled_at desc
   limit v_limit+1
  ) x;
  v_rows:=v_page||v_rows;
  exit when jsonb_array_length(v_rows)>=v_limit+1;
  exit when v_lower<=coalesce(v_earliest,v_lower);
  v_upper:=v_lower;
 end loop;
 select coalesce(jsonb_agg(e order by (e->>'scheduled_at')::timestamptz desc),'[]'::jsonb),
  count(*)
 into v_rows_sorted,v_count
 from jsonb_array_elements(v_rows) e;
 v_has_more:=v_count>v_limit or v_lower>coalesce(v_earliest,'-infinity'::timestamptz);
 if v_count>v_limit then
  select coalesce(jsonb_agg(x.e order by x.ord),'[]'::jsonb) into v_rows_sorted
   from (select e,ord from jsonb_array_elements(v_rows_sorted) with ordinality a(e,ord)
         order by ord limit v_limit) x;
  v_count:=v_limit;
 end if;
 if v_has_more then
  v_next:=case when v_count>0 then (v_rows_sorted->-1->>'scheduled_at')::timestamptz
               else v_lower end;
 end if;
 if p_cursor_at is null then
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'action',e.action,'status',e.status,'scheduled_at',e.scheduled_at,
    'taken_at',e.taken_at,'amount',coalesce(e.amount,''),'reason',coalesce(e.reason,''),
    'created_at',e.created_at) order by e.created_at desc,e.id desc),'[]'::jsonb)
  into v_events
  from (select id,action,status,scheduled_at,taken_at,amount,reason,created_at
        from public.health_dose_events
        where user_id=uid and medication_id=p_medication_id
        order by created_at desc,id desc limit 20) e;
 end if;
 return jsonb_build_object('timezone',v_tz,'filter',p_filter,
  'rows',v_rows_sorted,'has_more',v_has_more,
  'next_cursor_at',v_next,'next_cursor_id',null,'events',v_events);
end $body$;
revoke all on function public.health_treatment_history(uuid,text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.health_treatment_history(uuid,text,timestamptz,uuid,integer) to authenticated;

-- ===== 05-scheduler-backfill.sql =====
-- ---------------------------------------------------------------------------
-- 22. Scheduler: bounded materialization and revision-aware reminder queue
-- ---------------------------------------------------------------------------
create or replace function public.health_prepare_reminders() returns void
language plpgsql security invoker set search_path='' as $body$
declare v_from timestamptz:=now(); v_to timestamptz:=now()+interval '14 days';
begin
 perform health_private.ensure_occurrences_all(v_from,v_to);
 insert into public.health_reminders(
  user_id,medication_id,scheduled_at,offset_minutes,remind_at)
 select o.user_id,o.medication_id,o.scheduled_at,m.reminder_offset_minutes,
  o.scheduled_at-make_interval(mins=>m.reminder_offset_minutes)
 from public.health_medication_occurrences o
 join public.health_medications m
  on m.user_id=o.user_id and m.id=o.medication_id
 where o.canceled_at is null
  and m.status='active' and m.reminders_enabled
  and o.scheduled_at>=v_from and o.scheduled_at<v_to
  and o.scheduled_at-make_interval(mins=>m.reminder_offset_minutes)>=v_from
  and not exists(select 1 from public.health_doses d
   where d.user_id=o.user_id and d.medication_id=o.medication_id
    and d.scheduled_at=o.scheduled_at)
 on conflict do nothing;
 -- Retire stale future reminders (paused/finished/canceled) without touching history.
 update public.health_reminders r set dismissed_at=now()
 where r.medication_id is not null and r.dismissed_at is null
  and r.scheduled_at>=v_from and r.scheduled_at<v_to
  and (not exists(select 1 from public.health_medications m
        where m.user_id=r.user_id and m.id=r.medication_id
         and m.status='active' and m.reminders_enabled)
    or exists(select 1 from public.health_medication_occurrences o
        where o.user_id=r.user_id and o.medication_id=r.medication_id
         and o.scheduled_at=r.scheduled_at and o.canceled_at is not null));
end $body$;
revoke all on function public.health_prepare_reminders() from public,anon,authenticated;
grant execute on function public.health_prepare_reminders() to service_role;

-- Claim only reminders that are still eligible at claim time. The worker
-- revalidates again after claiming; external delivery is at-least-once.
create or replace function public.health_claim_reminders()
returns table(id uuid,user_id uuid)
language sql security invoker set search_path='' as $body$
 update public.health_reminders r set claimed_until=now()+interval '5 minutes'
 where r.id in (
  select q.id from public.health_reminders q
  left join public.health_medications m
   on m.user_id=q.user_id and m.id=q.medication_id
  where q.delivered_at is null and q.dismissed_at is null
   and q.remind_at<=now() and q.remind_at>now()-interval '1 day'
   and (q.claimed_until is null or q.claimed_until<now())
   and (q.medication_id is null or (
     m.status='active' and m.reminders_enabled
     and health_private.slot_schedule(q.user_id,q.medication_id,q.scheduled_at) is not null
     and not exists(select 1 from public.health_doses d
      where d.user_id=q.user_id and d.medication_id=q.medication_id
       and d.scheduled_at=q.scheduled_at)))
  order by q.remind_at limit 20 for update of q skip locked
 ) returning r.id,r.user_id;
$body$;
revoke all on function public.health_claim_reminders() from public,anon,authenticated;
grant execute on function public.health_claim_reminders() to service_role;

-- Refresh the current owner's queue after mutations (no cron required).
create or replace function public.health_refresh_reminders() returns void
language plpgsql security definer set search_path='' as $body$
declare uid uuid:=health_private.request_user_id(); v_from timestamptz:=now();
 v_to timestamptz:=now()+interval '14 days'; r_med record;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
 for r_med in select id from public.health_medications
   where user_id=uid and status='active' and reminders_enabled loop
  perform health_private.ensure_occurrences(uid,r_med.id,v_from,v_to);
 end loop;
 insert into public.health_reminders(
  user_id,medication_id,scheduled_at,offset_minutes,remind_at)
 select o.user_id,o.medication_id,o.scheduled_at,m.reminder_offset_minutes,
  o.scheduled_at-make_interval(mins=>m.reminder_offset_minutes)
 from public.health_medication_occurrences o
 join public.health_medications m
  on m.user_id=o.user_id and m.id=o.medication_id
 where o.user_id=uid and o.canceled_at is null
  and m.status='active' and m.reminders_enabled
  and o.scheduled_at>=v_from and o.scheduled_at<v_to
  and o.scheduled_at-make_interval(mins=>m.reminder_offset_minutes)>=v_from
  and not exists(select 1 from public.health_doses d
   where d.user_id=o.user_id and d.medication_id=o.medication_id
    and d.scheduled_at=o.scheduled_at)
 on conflict do nothing;
end $body$;
alter function public.health_refresh_reminders() owner to health_scheduler;
revoke all on function public.health_refresh_reminders() from public,anon,authenticated;
grant execute on function public.health_refresh_reminders() to authenticated;

-- ---------------------------------------------------------------------------
-- 23. Additive backfill of legacy times/timezone (idempotent, no data loss)
-- ---------------------------------------------------------------------------
create or replace function health_private.backfill_legacy_schedules()
returns integer language plpgsql security invoker set search_path='' as $body$
declare m record; v_times time[]; v_kind text; v_days integer; v_end timestamptz;
 v_effective timestamptz; n integer:=0;
begin
 perform set_config('health.migration_backfill','1',true);
 for m in
  select id,user_id,starts_on,ends_on,times,timezone,dose,dose_quantity,dose_unit_code
  from public.health_medications
  where not exists(select 1 from public.health_medication_schedules s
    where s.user_id=health_medications.user_id
     and s.medication_id=health_medications.id)
  order by id
 loop
  select array_agg(x order by x) into v_times
  from (select distinct unnest(m.times) x) s where x is not null;
  if v_times is null or cardinality(v_times)=0 then
   update public.health_medications set schedule_pending=true
    where id=m.id and not schedule_pending;
   continue;
  end if;
  if not exists(select 1 from pg_timezone_names z where z.name=m.timezone) then
   update public.health_medications set schedule_pending=true
    where id=m.id and not schedule_pending;
   continue;
  end if;
  v_kind:=case when m.ends_on is null then 'continuous' else 'finite' end;
  v_days:=case when m.ends_on is null then null else m.ends_on-m.starts_on+1 end;
  v_end:=case when m.ends_on is null then null
   else ((m.ends_on+1)::timestamp) at time zone m.timezone end;
  v_effective:=(m.starts_on::timestamp) at time zone m.timezone;
  insert into public.health_medication_schedules(
   user_id,medication_id,revision,mode,timezone,local_start_date,local_times,
   duration_kind,duration_days,end_exclusive_at,effective_from,
   dose_text_snapshot,quantity_snapshot,unit_snapshot)
  values(m.user_id,m.id,1,'daily_times',m.timezone,m.starts_on,v_times,
   v_kind,v_days,v_end,v_effective,m.dose,m.dose_quantity,m.dose_unit_code);
  update public.health_medications set schedule_pending=false
   where id=m.id and schedule_pending;
  n:=n+1;
 end loop;
 perform set_config('health.migration_backfill','',true);
 return n;
end $body$;
revoke all on function health_private.backfill_legacy_schedules() from public,anon,authenticated;
grant execute on function health_private.backfill_legacy_schedules() to service_role;

-- ===== 06-ownership.sql =====
-- ---------------------------------------------------------------------------
-- 24. Ownership and least privilege for the new write paths
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER paths run as the limited scheduler role (NOLOGIN,
-- NOINHERIT, NOBYPASSRLS); RLS still constrains every row to the caller.
-- ALTER OWNER requires the new owner to hold CREATE on the schema; this is
-- granted only for the duration of the migration.
grant create on schema health_private to health_scheduler;
grant create on schema public to health_scheduler;
alter function health_private.command_cached(uuid,uuid,text,jsonb) owner to health_scheduler;
alter function health_private.command_store(uuid,uuid,text,jsonb,jsonb) owner to health_scheduler;
alter function health_private.prune_commands(interval) owner to health_scheduler;
alter function health_private.revision_guard() owner to health_scheduler;
alter function health_private.sync_legacy_schedule(public.health_medications,boolean) owner to health_scheduler;
alter function health_private.dose_audit_before() owner to health_scheduler;
alter function health_private.dose_audit_after() owner to health_scheduler;
alter function health_private.dose_audit_delete() owner to health_scheduler;
alter function health_private.schedule_record() owner to health_scheduler;
alter function public.health_treatment_save(jsonb,uuid) owner to health_scheduler;
alter function public.health_treatment_state(uuid,text,timestamptz,bigint,text,uuid) owner to health_scheduler;
alter function public.health_dose_record(uuid,timestamptz,text,timestamptz,text,text,bigint,uuid) owner to health_scheduler;
alter function public.health_dose_undo(uuid,timestamptz,bigint,uuid) owner to health_scheduler;
revoke create on schema public from health_scheduler;
revoke create on schema health_private from health_scheduler;

-- The scheduler writes only through the new RPC/trigger paths.
grant insert,update on public.health_medications to health_scheduler;
grant select,insert,update,delete on public.health_medication_schedules to health_scheduler;

-- Invoker read RPCs resolve scheduled slots through health_private helpers.
-- Only execution grants determine what the client may call.
grant usage on schema health_private to authenticated;
grant usage on schema health_private to service_role;
grant execute on function health_private.local_instant(date,time,text) to authenticated,service_role;
grant execute on function health_private.schedule_slots(uuid,uuid,timestamptz,timestamptz) to service_role;
grant execute on function health_private.assert_budget(uuid,uuid,timestamptz,timestamptz) to service_role;
grant execute on function health_private.ensure_occurrences(uuid,uuid,timestamptz,timestamptz) to service_role;
grant execute on function health_private.slot_schedule(uuid,uuid,timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 25. Idempotent backfill (safe to run again; skips rows that already have a revision)
-- ---------------------------------------------------------------------------
select health_private.backfill_legacy_schedules();
commit;
