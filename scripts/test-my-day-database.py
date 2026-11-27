"""PC-001: run canonical migrations and owner/query-plan assertions in an EMPTY
PostgreSQL test database. Use PG* environment or a local --docker-container.
"""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--database', required=True)
parser.add_argument('--docker-container')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
command = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', args.database]
if args.docker_container:
    command = ['docker', 'exec', '-i', args.docker_container, *command, '-U', 'postgres']


def sql(source):
    result = subprocess.run(command, input=source, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


assert sql("select count(*) from pg_tables where schemaname='public'") == '0', 'Use an empty test database'
for name in (
    'tests/health_bootstrap.sql',
    'migrations/20261015000000_mf_push_subscriptions.sql',
    'migrations/20261107112044_health_guide.sql',
    'migrations/20261107121840_global_push_notifications.sql',
    'migrations/20261107161433_health_scheduler_auth_resolution.sql',
    'migrations/20261109000149_health_appointment_followups.sql',
    'migrations/20261109021510_health_recent_lists_indexes.sql',
    'migrations/20261113120000_medication_treatments.sql',
    'migrations/20261114002349_medication_treatment_review_fixes.sql',
    'migrations/20261114020244_mark_past_treatment_doses_taken.sql',
    'migrations/20261123021950_medication_dose_cards_and_push_privacy.sql',
):
    sql((root / 'supabase' / name).read_text())
# Push subscriptions were already created by the canonical push migration.
fixture = (root / 'src/tests/fixtures/mf-security-schema.sql').read_text()
sql('\n'.join(line for line in fixture.splitlines() if 'mf_push_subscriptions' not in line))
baseline = (root / 'supabase/migrations/20200101000000_baseline_schema.sql').read_text()
start = baseline.index('create table public.trip_itinerary (')
sql(baseline[start:baseline.index('\n);', start) + 3])
sql("""
alter table trip_itinerary add primary key(id);
do $$ declare t text;begin
 foreach t in array array['mf_accounts','mf_transactions','mf_invoices','trips','trip_itinerary'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy owner on %I to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
 end loop;
end$$;
do $$ declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity loop
  execute format('alter table public.%I enable row level security',t.relname);
 end loop;
end $$;
grant select,insert,update,delete on all tables in schema public to authenticated;
""")
files = list((root / 'supabase/migrations').glob('*_my_day_summary.sql'))
assert len(files) == 1
sql(files[0].read_text())
print(sql((root / 'supabase/tests/my_day.sql').read_text()))
