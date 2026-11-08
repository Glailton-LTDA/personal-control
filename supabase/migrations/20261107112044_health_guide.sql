-- Private medical guide. No sharing, public URLs or wildcard projections.
begin;

create table public.health_conditions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 255),
 status text not null default 'monitoring' check (status in ('monitoring','resolved','chronic')),
 diagnosed_on date,
 notes text not null default '' check(length(notes) <= 20000),
 created_at timestamptz not null default now(),
 unique(user_id,id)
);
create table public.health_appointments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 255),
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 starts_at timestamptz not null,
 professional text not null default '' check(length(professional)<=255),
 specialty text not null default '' check(length(specialty)<=255),
 location text not null default '' check(length(location)<=1000),
 notes text not null default '' check(length(notes)<=20000),
 reminder_minutes integer[] not null default '{1440,120}' check(cardinality(reminder_minutes)<=4 and 0<=all(reminder_minutes) and 10080>=all(reminder_minutes)),
 condition_id uuid,
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,condition_id) references public.health_conditions(user_id,id)
);
create table public.health_medications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 255),
 dose text not null check(length(trim(dose)) between 1 and 255),
 status text not null default 'active' check(status in ('active','paused','finished')),
 starts_on date not null,
 ends_on date check(ends_on >= starts_on),
 times time[] not null default '{}' check(cardinality(times)<=24 and array_position(times,null) is null),
 timezone text not null check(length(timezone)<=100),
 reminders_enabled boolean not null default true,
 notes text not null default '' check(length(notes)<=20000),
 condition_id uuid,
 appointment_id uuid,
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,condition_id) references public.health_conditions(user_id,id),
 foreign key(user_id,appointment_id) references public.health_appointments(user_id,id),
 check(not reminders_enabled or cardinality(times)>0)
);
create table public.health_exams (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 255),
 status text not null default 'requested' check(status in ('requested','scheduled','awaiting','completed','cancelled')),
 performed_at timestamptz,
 laboratory text not null default '' check(length(laboratory)<=255),
 professional text not null default '' check(length(professional)<=255),
 report text not null default '' check(length(report)<=100000),
 preparation text not null default '' check(length(preparation)<=20000),
 notes text not null default '' check(length(notes)<=20000),
 reminder_minutes integer[] not null default '{1440,120}' check(cardinality(reminder_minutes)<=4 and 0<=all(reminder_minutes) and 10080>=all(reminder_minutes)),
 condition_id uuid,
 appointment_id uuid,
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,condition_id) references public.health_conditions(user_id,id),
 foreign key(user_id,appointment_id) references public.health_appointments(user_id,id),
 check(status not in ('scheduled','completed') or performed_at is not null)
);
create table public.health_results (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 exam_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 255),
 value text not null check(length(trim(value)) between 1 and 1000),
 unit text not null default '' check(length(unit)<=100),
 reference_range text not null default '' check(length(reference_range)<=1000),
 created_at timestamptz not null default now(),
 foreign key(user_id,exam_id) references public.health_exams(user_id,id) on delete cascade
);
create table public.health_doses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 medication_id uuid not null,
 scheduled_at timestamptz not null,
 taken_at timestamptz,
 status text not null check(status in ('taken','skipped')),
 amount text not null default '' check(length(amount)<=255),
 created_at timestamptz not null default now(),
 foreign key(user_id,medication_id) references public.health_medications(user_id,id) on delete cascade,
 unique(user_id,medication_id,scheduled_at),
 check((status='taken' and taken_at is not null) or (status='skipped' and taken_at is null))
);
create table public.health_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 255),
 category text not null check(category in ('prescription','request','report','result','image','other')),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp','application/dicom')),
 size_bytes bigint not null check(size_bytes between 1 and 20971520),
 storage_path text not null unique,
 condition_id uuid,
 appointment_id uuid,
 medication_id uuid,
 exam_id uuid,
 created_at timestamptz not null default now(),
 foreign key(user_id,condition_id) references public.health_conditions(user_id,id),
 foreign key(user_id,appointment_id) references public.health_appointments(user_id,id),
 foreign key(user_id,medication_id) references public.health_medications(user_id,id),
 foreign key(user_id,exam_id) references public.health_exams(user_id,id),
 check(storage_path = user_id::text || '/' || id::text || case mime_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' when 'application/dicom' then '.dcm' end)
);
create table public.health_reminders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 medication_id uuid,
 appointment_id uuid,
 exam_id uuid,
 scheduled_at timestamptz not null,
 offset_minutes integer not null default 0,
 remind_at timestamptz not null,
 dismissed_at timestamptz,
 delivered_at timestamptz,
 claimed_until timestamptz,
 foreign key(user_id,medication_id) references public.health_medications(user_id,id) on delete cascade,
 foreign key(user_id,appointment_id) references public.health_appointments(user_id,id) on delete cascade,
 foreign key(user_id,exam_id) references public.health_exams(user_id,id) on delete cascade,
 check(num_nonnulls(medication_id,appointment_id,exam_id)=1)
);
create unique index health_reminders_med_unique on public.health_reminders(user_id,medication_id,scheduled_at) where medication_id is not null;
create unique index health_reminders_app_unique on public.health_reminders(user_id,appointment_id,scheduled_at,offset_minutes) where appointment_id is not null;
create unique index health_reminders_exam_unique on public.health_reminders(user_id,exam_id,scheduled_at,offset_minutes) where exam_id is not null;
create index health_reminders_due on public.health_reminders(remind_at) where delivered_at is null and dismissed_at is null;
create index health_reminders_user_due on public.health_reminders(user_id,remind_at,id) where dismissed_at is null;
create table public.health_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<=2048 and endpoint like 'https://%'),
 p256dh text not null check(length(p256dh) between 1 and 200),
 auth text not null check(length(auth) between 1 and 100),
 language text not null default 'pt' check(language in ('pt','en','es')),
 created_at timestamptz not null default now(),
 unique(user_id,endpoint)
);
create index health_conditions_owner_sort on public.health_conditions(user_id,name,id);
alter table public.health_conditions add column name_search text collate "C" generated always as (lower(name)) stored;
create index health_conditions_name_search on public.health_conditions(user_id,name_search,id);
alter table public.health_conditions enable row level security;
revoke all on public.health_conditions from anon, authenticated;
grant select, insert, update, delete on public.health_conditions to authenticated;
grant all on public.health_conditions to service_role;
create policy health_conditions_read on public.health_conditions for select to authenticated using(user_id=(select auth.uid()));
create policy health_conditions_create on public.health_conditions for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_conditions_change on public.health_conditions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_conditions_remove on public.health_conditions for delete to authenticated using(user_id=(select auth.uid()));
create index health_appointments_owner_sort on public.health_appointments(user_id,starts_at,id);
alter table public.health_appointments add column name_search text collate "C" generated always as (lower(name)) stored;
create index health_appointments_name_search on public.health_appointments(user_id,name_search,id);
alter table public.health_appointments enable row level security;
revoke all on public.health_appointments from anon, authenticated;
grant select, insert, update, delete on public.health_appointments to authenticated;
grant all on public.health_appointments to service_role;
create policy health_appointments_read on public.health_appointments for select to authenticated using(user_id=(select auth.uid()));
create policy health_appointments_create on public.health_appointments for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_appointments_change on public.health_appointments for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_appointments_remove on public.health_appointments for delete to authenticated using(user_id=(select auth.uid()));
create index health_medications_owner_sort on public.health_medications(user_id,name,id);
alter table public.health_medications add column name_search text collate "C" generated always as (lower(name)) stored;
create index health_medications_name_search on public.health_medications(user_id,name_search,id);
alter table public.health_medications enable row level security;
revoke all on public.health_medications from anon, authenticated;
grant select, insert, update, delete on public.health_medications to authenticated;
grant all on public.health_medications to service_role;
create policy health_medications_read on public.health_medications for select to authenticated using(user_id=(select auth.uid()));
create policy health_medications_create on public.health_medications for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_medications_change on public.health_medications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_medications_remove on public.health_medications for delete to authenticated using(user_id=(select auth.uid()));
create index health_exams_owner_sort on public.health_exams(user_id,performed_at desc,id);
alter table public.health_exams add column name_search text collate "C" generated always as (lower(name)) stored;
create index health_exams_name_search on public.health_exams(user_id,name_search,id);
alter table public.health_exams enable row level security;
revoke all on public.health_exams from anon, authenticated;
grant select, insert, update, delete on public.health_exams to authenticated;
grant all on public.health_exams to service_role;
create policy health_exams_read on public.health_exams for select to authenticated using(user_id=(select auth.uid()));
create policy health_exams_create on public.health_exams for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_exams_change on public.health_exams for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_exams_remove on public.health_exams for delete to authenticated using(user_id=(select auth.uid()));
create index health_documents_owner_sort on public.health_documents(user_id,created_at desc,id);
alter table public.health_documents add column name_search text collate "C" generated always as (lower(name)) stored;
create index health_documents_name_search on public.health_documents(user_id,name_search,id);
alter table public.health_documents enable row level security;
revoke all on public.health_documents from anon, authenticated;
grant select, insert, update, delete on public.health_documents to authenticated;
grant all on public.health_documents to service_role;
create policy health_documents_read on public.health_documents for select to authenticated using(user_id=(select auth.uid()));
create policy health_documents_create on public.health_documents for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_documents_change on public.health_documents for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_documents_remove on public.health_documents for delete to authenticated using(user_id=(select auth.uid()));
create index health_doses_owner_sort on public.health_doses(user_id,scheduled_at desc,id);
alter table public.health_doses enable row level security;
revoke all on public.health_doses from anon, authenticated;
grant select, insert, update, delete on public.health_doses to authenticated;
grant all on public.health_doses to service_role;
create policy health_doses_read on public.health_doses for select to authenticated using(user_id=(select auth.uid()));
create policy health_doses_create on public.health_doses for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_doses_change on public.health_doses for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_doses_remove on public.health_doses for delete to authenticated using(user_id=(select auth.uid()));
create index health_results_owner_sort on public.health_results(user_id,created_at desc,id);
alter table public.health_results enable row level security;
revoke all on public.health_results from anon, authenticated;
grant select, insert, update, delete on public.health_results to authenticated;
grant all on public.health_results to service_role;
create policy health_results_read on public.health_results for select to authenticated using(user_id=(select auth.uid()));
create policy health_results_create on public.health_results for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_results_change on public.health_results for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_results_remove on public.health_results for delete to authenticated using(user_id=(select auth.uid()));
create index health_push_subscriptions_owner_sort on public.health_push_subscriptions(user_id,id,id);
alter table public.health_push_subscriptions enable row level security;
revoke all on public.health_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.health_push_subscriptions to authenticated;
grant all on public.health_push_subscriptions to service_role;
create policy health_push_subscriptions_read on public.health_push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy health_push_subscriptions_create on public.health_push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()));
create policy health_push_subscriptions_change on public.health_push_subscriptions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_push_subscriptions_remove on public.health_push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
create index health_appointments_condition_id_idx on public.health_appointments(user_id,condition_id,starts_at,id);
create index health_medications_condition_id_idx on public.health_medications(user_id,condition_id,name,id);
create index health_medications_appointment_id_idx on public.health_medications(user_id,appointment_id,name,id);
create index health_exams_condition_id_idx on public.health_exams(user_id,condition_id,performed_at desc,id);
create index health_exams_appointment_id_idx on public.health_exams(user_id,appointment_id,performed_at desc,id);
create index health_documents_condition_id_idx on public.health_documents(user_id,condition_id,created_at desc,id);
create index health_documents_appointment_id_idx on public.health_documents(user_id,appointment_id,created_at desc,id);
create index health_documents_medication_id_idx on public.health_documents(user_id,medication_id,created_at desc,id);
create index health_documents_exam_id_idx on public.health_documents(user_id,exam_id,created_at desc,id);
create index health_results_exam_id_idx on public.health_results(user_id,exam_id,created_at desc,id);
create index health_medications_active on public.health_medications(user_id,starts_on,ends_on) where status='active' and reminders_enabled;
create index health_exams_history on public.health_exams(user_id,name,performed_at desc,id);
alter table public.health_reminders enable row level security;
revoke all on public.health_reminders from anon,authenticated;
grant select on public.health_reminders to authenticated;
grant update(remind_at,dismissed_at) on public.health_reminders to authenticated;
grant all on public.health_reminders to service_role;
create policy health_reminders_read on public.health_reminders for select to authenticated using(user_id=(select auth.uid()));
create policy health_reminders_change on public.health_reminders for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Private bucket, never use getPublicUrl or a bearer signed URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('health-documents','health-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','application/dicom']);
create policy health_storage_read on storage.objects for select to authenticated using(
 bucket_id='health-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.health_documents d where d.user_id=(select auth.uid()) and d.storage_path=storage.objects.name));
create policy health_storage_create on storage.objects for insert to authenticated with check(
 bucket_id='health-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.health_documents d where d.user_id=(select auth.uid()) and d.storage_path=storage.objects.name));
create policy health_storage_remove on storage.objects for delete to authenticated using(
 bucket_id='health-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Restrictive guard also defeats pre-existing overly broad permissive policies.
create policy health_storage_guard on storage.objects as restrictive for all to public
using(bucket_id<>'health-documents' or (
 (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.health_documents d where d.user_id=(select auth.uid()) and d.storage_path=storage.objects.name)))
with check(bucket_id<>'health-documents' or (
 (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.health_documents d where d.user_id=(select auth.uid()) and d.storage_path=storage.objects.name)));

-- Queue writes are trigger-only for clients. Triggers run as a non-login,
-- non-bypassrls role limited to these tables, not as postgres/service_role.
do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='health_scheduler') then
  create role health_scheduler nologin noinherit nobypassrls;
 end if;
end $roles$;
-- Managed Supabase migrators are not superusers. Membership is required to
-- assign function ownership; never grant this internal role to client roles.
do $membership$ begin
 execute format('grant health_scheduler to %I', current_user);
end $membership$;
grant usage on schema public to health_scheduler;
grant execute on function auth.uid() to health_scheduler;
grant select on public.health_medications,public.health_appointments,public.health_exams,public.health_doses to health_scheduler;
grant select,insert,update,delete on public.health_reminders to health_scheduler;
create policy health_scheduler_medications on public.health_medications for all to health_scheduler using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_scheduler_appointments on public.health_appointments for all to health_scheduler using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_scheduler_exams on public.health_exams for all to health_scheduler using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_scheduler_doses on public.health_doses for all to health_scheduler using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy health_scheduler_reminders on public.health_reminders for all to health_scheduler using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create schema if not exists health_private;
revoke all on schema health_private from public,anon,authenticated;
grant usage,create on schema health_private to health_scheduler;
create function health_private.schedule_record() returns trigger
language plpgsql security definer set search_path='' as $body$
declare d date; tm time; occurrence timestamptz; minutes integer;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'ownership required' using errcode='42501'; end if;
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
alter function health_private.schedule_record() owner to health_scheduler;
revoke all on function health_private.schedule_record() from public,anon,authenticated;
create trigger health_medications_schedule after insert or update on public.health_medications for each row execute function health_private.schedule_record();
create trigger health_appointments_schedule after insert or update on public.health_appointments for each row execute function health_private.schedule_record();
create trigger health_exams_schedule after insert or update on public.health_exams for each row execute function health_private.schedule_record();

create function health_private.dose_recorded() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if new.user_id is distinct from auth.uid() then raise exception 'ownership required' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.medication_id is distinct from old.medication_id or new.scheduled_at is distinct from old.scheduled_at) then
  raise exception 'dose schedule is immutable' using errcode='22023';
 end if;
 update public.health_reminders set dismissed_at=now()
 where user_id=new.user_id and medication_id=new.medication_id and scheduled_at=new.scheduled_at;
 return new;
end;
$body$;
alter function health_private.dose_recorded() owner to health_scheduler;
revoke all on function health_private.dose_recorded() from public,anon,authenticated;
create trigger health_doses_recorded after insert or update on public.health_doses for each row execute function health_private.dose_recorded();

-- Snoozing a delivered reminder must make it eligible for delivery again.
create function health_private.reset_delivery() returns trigger
language plpgsql security invoker set search_path='' as $body$
begin
 if new.remind_at is distinct from old.remind_at then
  new.delivered_at := null;
  new.claimed_until := null;
 end if;
 return new;
end;
$body$;
revoke all on function health_private.reset_delivery() from public,anon,authenticated;
create trigger health_reminders_snoozed before update of remind_at on public.health_reminders for each row execute function health_private.reset_delivery();

-- Worker maintenance and atomic leases. Invoker rights, service role only.
create function public.health_prepare_reminders() returns void
language sql security invoker set search_path='' as $body$
 insert into public.health_reminders(user_id,medication_id,scheduled_at,remind_at)
 select m.user_id,m.id,(d.day::date+tm.at) at time zone m.timezone,(d.day::date+tm.at) at time zone m.timezone
 from public.health_medications m
 cross join lateral generate_series((now() at time zone m.timezone)::date,((now() at time zone m.timezone)::date+2),'1 day') d(day)
 cross join lateral unnest(m.times) tm(at)
 where m.status='active' and m.reminders_enabled and m.starts_on<=d.day::date and (m.ends_on is null or m.ends_on>=d.day::date)
 and ((d.day::date+tm.at) at time zone m.timezone)>now()
 and not exists(select 1 from public.health_doses dose where dose.user_id=m.user_id and dose.medication_id=m.id and dose.scheduled_at=(d.day::date+tm.at) at time zone m.timezone)
 on conflict do nothing;
$body$;
create function public.health_claim_reminders() returns table(id uuid,user_id uuid)
language sql security invoker set search_path='' as $body$
 update public.health_reminders r set claimed_until=now()+interval '5 minutes'
 where r.id in (
  select q.id from public.health_reminders q
  where q.delivered_at is null and q.dismissed_at is null and q.remind_at<=now()
   and q.remind_at>now()-interval '1 day' and (q.claimed_until is null or q.claimed_until<now())
  order by q.remind_at limit 20 for update skip locked
 ) returning r.id,r.user_id;
$body$;
revoke all on function public.health_prepare_reminders(),public.health_claim_reminders() from public,anon,authenticated;
grant execute on function public.health_prepare_reminders(),public.health_claim_reminders() to service_role;
-- Refresh the current owner's next doses even when push/cron is not configured.
-- Limited, non-bypassrls function owner; table policies still apply.
grant create on schema public to health_scheduler;
create function public.health_refresh_reminders() returns void
language plpgsql security definer set search_path='' as $body$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 insert into public.health_reminders(user_id,medication_id,scheduled_at,remind_at)
 select m.user_id,m.id,(d.day::date+tm.at) at time zone m.timezone,(d.day::date+tm.at) at time zone m.timezone
 from public.health_medications m
 cross join lateral generate_series((now() at time zone m.timezone)::date,((now() at time zone m.timezone)::date+2),'1 day') d(day)
 cross join lateral unnest(m.times) tm(at)
 where m.user_id=(select auth.uid()) and m.status='active' and m.reminders_enabled and m.starts_on<=d.day::date and (m.ends_on is null or m.ends_on>=d.day::date)
 and ((d.day::date+tm.at) at time zone m.timezone)>now()
 and not exists(select 1 from public.health_doses dose where dose.user_id=m.user_id and dose.medication_id=m.id and dose.scheduled_at=(d.day::date+tm.at) at time zone m.timezone)
 on conflict do nothing;
end;
$body$;
alter function public.health_refresh_reminders() owner to health_scheduler;
revoke all on function public.health_refresh_reminders() from public,anon,authenticated;
grant execute on function public.health_refresh_reminders() to authenticated;
revoke create on schema public from health_scheduler;

revoke create on schema health_private from health_scheduler;
commit;
