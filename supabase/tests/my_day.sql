-- Synthetic, disposable regression only. Run after test-my-day-database.py setup.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
do $$ begin
 if has_function_privilege('anon','public.my_day_summary(text,text[])','EXECUTE') then raise exception 'Anonymous access'; end if;
 if exists(select 1 from pg_proc where oid='public.my_day_summary(text,text[])'::regprocedure and prosecdef) then raise exception 'Unexpected definer'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into health_appointments(name,starts_at) values('Owner appointment',date_trunc('day',now())+interval '12 hours');
insert into mf_accounts(id,user_id,name,currency) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',auth.uid(),'Synthetic bank','BRL');
insert into mf_transactions(user_id,account_id,type,description,amount,payment_date,status)
 values(auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','DESPESA','Owner payment',129.90,current_date,'PENDENTE');
select health_treatment_save(jsonb_build_object('name','Owner medicine','dose','1 capsule','mode','interval','timezone','UTC',
 'anchor_date',current_date::text,'anchor_time','00:00','interval_minutes',480,'duration_kind','continuous','reminders_enabled',false),gen_random_uuid());
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
insert into health_appointments(name,starts_at) values('Foreign appointment',now());
do $$ declare v jsonb;begin
 v:=my_day_summary('UTC',array['health','minhasfinancas','trips']);
 if jsonb_array_length(v#>'{sections,appointments,rows}')<>1 or v#>>'{sections,appointments,rows,0,title}'<>'Foreign appointment' then raise exception 'Owner leak'; end if;
 if jsonb_array_length(v#>'{sections,doses,rows}')<>0 or jsonb_array_length(v#>'{sections,payments,rows}')<>0 then raise exception 'Cross-module leak'; end if;
end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare v jsonb;begin
 v:=my_day_summary('UTC',array['health','minhasfinancas','trips']);
 if jsonb_array_length(v#>'{sections,doses,rows}')<>3 then raise exception 'Schedule missing'; end if;
 if (v#>>'{sections,payments,rows,0,amount}')::numeric<>129.90 then raise exception 'Payment missing'; end if;
 if my_day_summary('UTC','{}') -> 'sections' <> '{}'::jsonb then raise exception 'Disabled sources loaded'; end if;
end $$;
insert into health_appointments(name,starts_at) select 'Bounded '||n,now() from generate_series(1,25) n;
do $$ declare v jsonb;begin
 v:=my_day_summary('UTC',array['health']);
 if jsonb_array_length(v#>'{sections,appointments,rows}')<>20 or v#>>'{sections,appointments,has_more}'<>'true' then raise exception 'Unbounded preview'; end if;
end $$;
-- Realistic selective range: 12,000 older rows, none downloaded by the preview.
insert into mf_transactions(user_id,account_id,type,description,amount,payment_date,status)
 select auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','DESPESA','Historical synthetic expense',1,current_date-100-(n%100),'PENDENTE' from generate_series(1,12000) n;
reset role;
analyze mf_transactions;
set role authenticated;
do $$ declare plan json;begin
 execute 'explain(format json) select id from mf_transactions where user_id=auth.uid() and status=''PENDENTE'' and type=''DESPESA'' and invoice_close is null and coalesce(due_date,payment_date) between current_date-7 and current_date+7 order by coalesce(due_date,payment_date),id limit 21' into plan;
 if plan::text not like '%my_day_pending_due%' then raise exception 'Missing selective due-date plan: %',plan; end if;
end $$;
rollback;
select 'PASS: authenticated owner-only preview, medication slots, bounded rows and selective indexed financial plan';
