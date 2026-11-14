-- Synthetic only: bounded RPC projections and owner/window indexes.
\set ON_ERROR_STOP on
begin;
insert into auth.users values('88888888-8888-4888-8888-888888888888');
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
insert into health_medications(user_id,name,dose,starts_on,times,timezone,reminders_enabled)
select '88888888-8888-4888-8888-888888888888','Synthetic '||i,'1',current_date-365,
 array['06:00'::time,'14:00'::time,'22:00'::time],'UTC',false from generate_series(1,50) i;
select health_private.ensure_occurrences('88888888-8888-4888-8888-888888888888',id,now()-interval '42 days',now()+interval '8 days')
from health_medications where user_id='88888888-8888-4888-8888-888888888888';
analyze health_medications;
analyze health_medication_schedules;
analyze health_medication_occurrences;
set local role authenticated;
explain(analyze,buffers)
 select id,scheduled_at,schedule_id from health_medication_occurrences
 where user_id='88888888-8888-4888-8888-888888888888' and scheduled_at>=now() and scheduled_at<now()+interval '1 day'
 order by scheduled_at,id limit 21;
explain(analyze,buffers) select health_treatment_list('active','synthetic',20,0);
explain(analyze,buffers) select health_treatment_dashboard('UTC');
explain(analyze,buffers)
 select health_treatment_history(id,'all',null,null,20) from health_medications
 where user_id='88888888-8888-4888-8888-888888888888' order by id limit 1;
reset role;
rollback;
