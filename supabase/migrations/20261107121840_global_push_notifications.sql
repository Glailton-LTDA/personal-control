-- One device consent for the entire app. No module can enable/disable push.
begin;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint like 'https://%'),
 p256dh text not null check(length(p256dh) between 1 and 200),
 auth text not null check(length(auth) between 1 and 100),
 language text not null default 'pt' check(language in ('pt','en','es')),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create index push_subscriptions_owner on public.push_subscriptions(user_id,id);
create index push_subscriptions_active on public.push_subscriptions(user_id,id) where enabled;
create index push_subscriptions_active_cursor on public.push_subscriptions(id) where enabled;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_read_own on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy push_create_own on public.push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()));
create policy push_update_own on public.push_subscriptions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy push_delete_own on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));

-- Preserve legacy consent. If an endpoint has different owners, fail closed.
with legacy as (
 select user_id,endpoint,p256dh,auth,'pt'::text as language,created_at,0 as priority from public.mf_push_subscriptions
 union all
 select user_id,endpoint,p256dh,auth,language,created_at,1 as priority from public.health_push_subscriptions
), unambiguous as (
 select endpoint from legacy group by endpoint having count(distinct user_id)=1
), chosen as (
 select distinct on(l.endpoint) l.user_id,l.endpoint,l.p256dh,l.auth,l.language,l.created_at
 from legacy l join unambiguous u on u.endpoint=l.endpoint
 where length(l.endpoint)<=2048 and l.endpoint like 'https://%'
 and length(l.p256dh) between 1 and 200 and length(l.auth) between 1 and 100
 order by l.endpoint,l.created_at desc,l.priority desc
)
insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,language,created_at)
select user_id,endpoint,p256dh,auth,language,created_at from chosen;

-- Keep original rows for operational rollback, inaccessible through the Data API.
alter table public.mf_push_subscriptions rename to mf_push_subscriptions_legacy;
alter table public.health_push_subscriptions rename to health_push_subscriptions_legacy;
revoke all on public.mf_push_subscriptions_legacy,public.health_push_subscriptions_legacy from public,anon,authenticated,service_role;
-- Existing workers see the GLOBAL enabled state during a staggered deployment.
create view public.mf_push_subscriptions with(security_invoker=true) as
 select id,user_id,endpoint,p256dh,auth,created_at from public.push_subscriptions where enabled;
create view public.health_push_subscriptions with(security_invoker=true) as
 select id,user_id,endpoint,p256dh,auth,language,created_at from public.push_subscriptions where enabled;
revoke all on public.mf_push_subscriptions,public.health_push_subscriptions from public,anon,authenticated;
grant select on public.mf_push_subscriptions,public.health_push_subscriptions to authenticated;
grant select,delete on public.mf_push_subscriptions,public.health_push_subscriptions to service_role;
commit;
