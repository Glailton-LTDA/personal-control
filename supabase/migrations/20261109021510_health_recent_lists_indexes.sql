-- No row/policy/grant changes. Match the new owner-scoped chronological lists.
begin;
create index health_conditions_recent on public.health_conditions(user_id,created_at desc,id);
create index health_medications_recent on public.health_medications(user_id,starts_on desc,id);
-- Undated exams belong at the end of both lists and related histories.
drop index public.health_exams_owner_sort;
create index health_exams_owner_sort on public.health_exams(user_id,performed_at desc nulls last,id);
drop index public.health_exams_history;
create index health_exams_history on public.health_exams(user_id,name,performed_at desc nulls last,id);
drop index public.health_exams_condition_id_idx;
create index health_exams_condition_id_idx on public.health_exams(user_id,condition_id,performed_at desc nulls last,id);
drop index public.health_exams_appointment_id_idx;
create index health_exams_appointment_id_idx on public.health_exams(user_id,appointment_id,performed_at desc nulls last,id);
commit;
