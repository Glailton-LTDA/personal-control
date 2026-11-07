-- Operational setup, NOT part of automatic migrations.
-- Run only in the intended hosted project after deploying health-reminders.
-- Required Vault secrets (create them through the dashboard, never commit values):
--   health_reminders_url: https://<project>.supabase.co/functions/v1/health-reminders
--   health_cron_secret: same strong random value as Edge Function CRON_SECRET.
-- Enable pg_cron and pg_net through the project's Extensions screen first.
-- This script validates setup before creating a job and never prints a secret.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron')
 or not exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Enable pg_cron and pg_net before scheduling';
 end if;
 if not exists(select 1 from vault.secrets where name='health_reminders_url')
 or not exists(select 1 from vault.secrets where name='health_cron_secret') then
  raise exception 'Configure health_reminders_url and health_cron_secret in Vault';
 end if;
end $$;
select cron.schedule('health-reminders','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='health_reminders_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='health_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$job$);
