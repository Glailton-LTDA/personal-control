-- Synthetic performance check. Never run against production.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.health_exams(user_id,name,status,performed_at)
select '11111111-1111-4111-8111-111111111111'::uuid,
 case when n%10=0 then 'Hemograma' else 'Exame '||n end,'requested',now()-n*interval '1 hour'
from generate_series(1,10000) n;
analyze public.health_exams;
insert into public.health_appointments(id,user_id,name,status,starts_at)
values('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','11111111-1111-4111-8111-111111111111','Consulta original','completed',now());
insert into public.health_appointments(user_id,name,status,starts_at,follow_up_of)
select '11111111-1111-4111-8111-111111111111'::uuid,'Consulta '||n,'completed',now()+n*interval '1 hour',
 case when n%50=0 then 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid else null end
from generate_series(1,5000) n;
analyze public.health_appointments;
set local role authenticated;
explain (analyze,buffers)
 select id,name,status,performed_at,laboratory,professional from public.health_exams
 where user_id='11111111-1111-4111-8111-111111111111'
 order by performed_at desc,id limit 21;
explain (analyze,buffers)
 select id,name,status,performed_at,laboratory,professional from public.health_exams
 where user_id='11111111-1111-4111-8111-111111111111' and name='Hemograma'
 order by performed_at desc,id limit 21;
explain (analyze,buffers)
 select id,name,status,performed_at,laboratory,professional from public.health_exams
 where user_id='11111111-1111-4111-8111-111111111111' and name_search>='exame 1999' and name_search<'exame 199:'
 order by name_search,id limit 21;
explain (analyze,buffers)
 select id,name,status,starts_at,professional from public.health_appointments
 where user_id='11111111-1111-4111-8111-111111111111' and follow_up_of='cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
 order by starts_at,id limit 21;
reset role;
rollback;
