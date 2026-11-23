-- Only for the disposable PostgreSQL test container (not a migration).
create schema auth;
create schema storage;
create schema extensions;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
-- Match the existing baseline notification settings ownership contract.
create table public.notification_settings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id)
);
alter table public.notification_settings enable row level security;
create policy "Users can manage their own settings" on public.notification_settings
 for all to authenticated using(auth.uid()=user_id);
grant select,insert,update,delete on public.notification_settings to authenticated;
grant all on public.notification_settings to service_role;
