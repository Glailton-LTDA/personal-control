-- Run against the disposable database after the dose-card migration.
begin;
insert into auth.users(id) values ('77777777-7777-4777-8777-777777777771'),('77777777-7777-4777-8777-777777777772');
set local role authenticated;
set local request.jwt.claim.sub='77777777-7777-4777-8777-777777777771';
do $test$
declare med uuid; result jsonb; item jsonb; slots jsonb; old_amount text;
begin
 insert into public.notification_settings(user_id) values(auth.uid());
 if (select show_medication_details from public.notification_settings where user_id=auth.uid()) then
  raise exception 'Details must be hidden by default';
 end if;
 update public.notification_settings set show_medication_details=true where user_id=auth.uid();
 med:=(public.health_treatment_save(jsonb_build_object('name','Synthetic cards','dose','1 tablet',
  'mode','interval','timezone','UTC','anchor_date',(current_date-2)::text,
  'anchor_time','00:00','interval_minutes',480,'duration_kind','continuous',
  'reminders_enabled',false),gen_random_uuid())->>'id')::uuid;
 result:=public.health_treatment_list('active','Synthetic cards',20,0);
 item:=result->'rows'->0;
 slots:=item->'today'->'slots';
 if item->>'id'<>med::text or jsonb_array_length(slots)<>3 then raise exception 'Expected today slots'; end if;
 if not (slots->0 ? 'record_version') or slots->0->>'planned_amount'<>'1 tablet' then raise exception 'Missing dose contract'; end if;
 if (item->'today'->>'planned')::int<>jsonb_array_length(slots) then raise exception 'Counts differ from slots'; end if;
 if exists(select 1 from jsonb_array_elements(slots) s where (s->>'scheduled_at')::timestamptz < current_date::timestamptz or (s->>'scheduled_at')::timestamptz >= (current_date+1)::timestamptz) then raise exception 'Out-of-day slot'; end if;
 perform public.health_dose_record(med,(slots->0->>'scheduled_at')::timestamptz,'taken',now(),'1 tablet','',0,gen_random_uuid());
 item:=public.health_treatment_list('active','Synthetic cards',20,0)->'rows'->0;
 if item->'today'->'slots'->0->>'status'<>'taken' or item->>'last_taken_at' is null then raise exception 'Card did not reflect recorded dose'; end if;
 perform public.health_dose_undo(med,(slots->0->>'scheduled_at')::timestamptz,
  (item->'today'->'slots'->0->>'record_version')::integer,gen_random_uuid());
 if public.health_treatment_list('active','Synthetic cards',20,0)->'rows'->0->'today'->'slots'->0->>'status'<>'missed' then raise exception 'Card did not reflect undo'; end if;
 -- A pending older reminder must retain its prescribed snapshot after editing.
 perform public.health_treatment_save(jsonb_build_object('id',med,
  'expected_version',(select row_version from public.health_medications where id=med),
  'name','Synthetic cards','dose','9 tablets','mode','interval','timezone','UTC',
  'anchor_date',(current_date-2)::text,'anchor_time','00:00','interval_minutes',480,
  'duration_kind','continuous','reminders_enabled',false),gen_random_uuid());
 select dose_text_snapshot into old_amount from public.health_medication_schedules
  where user_id=auth.uid() and medication_id=med and effective_from<=(slots->0->>'scheduled_at')::timestamptz
  order by effective_from desc,revision desc limit 1;
 if old_amount<>'1 tablet' or (select dose from public.health_medications where id=med)<>'9 tablets' then
  raise exception 'Historical reminder quantity changed with the current medication';
 end if;
 begin
  update public.notification_settings set user_id='77777777-7777-4777-8777-777777777772' where user_id=auth.uid();
  raise exception 'Owner reassigned preference';
 exception when insufficient_privilege then null; end;

end $test$;
set local request.jwt.claim.sub='77777777-7777-4777-8777-777777777772';
do $test$ begin
 if exists(select 1 from public.notification_settings) then raise exception 'Cross-owner preference leaked'; end if;
 if jsonb_array_length(public.health_treatment_list('all','Synthetic cards',20,0)->'rows')<>0 then raise exception 'Cross-owner slots leaked'; end if;
 update public.notification_settings set show_medication_details=false where user_id='77777777-7777-4777-8777-777777777771';
 if found then raise exception 'Cross-owner preference updated'; end if;
 begin
  insert into public.notification_settings(user_id,show_medication_details) values('77777777-7777-4777-8777-777777777771',true);
  raise exception 'Cross-owner preference inserted';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
