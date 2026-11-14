"""Run only against an EMPTY disposable database, using PG* or a local container.

Validates upgrade with pre-feature data and concurrent writes on two actual
PostgreSQL sessions. No production URL or credentials are embedded.
"""
import argparse
from pathlib import Path
import subprocess
import time

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


assert sql("select count(*) from information_schema.tables where table_schema='public'") == '0', 'Use an empty disposable database'
for name in (
    'tests/health_bootstrap.sql',
    'migrations/20261015000000_mf_push_subscriptions.sql',
    'migrations/20261107112044_health_guide.sql',
    'migrations/20261107121840_global_push_notifications.sql',
    'migrations/20261107161433_health_scheduler_auth_resolution.sql',
    'migrations/20261109000149_health_appointment_followups.sql',
    'migrations/20261109021510_health_recent_lists_indexes.sql',
):
    sql((root / 'supabase' / name).read_text())
owner = '55555555-5555-4555-8555-555555555555'
identity = f"set role authenticated; set request.jwt.claim.sub='{owner}';"
sql(f"insert into auth.users values('{owner}');" + identity + """
insert into health_medications(name,dose,starts_on,times,timezone,reminders_enabled)
values('Legacy without times','1',current_date,'{}','UTC',false);
insert into health_medications(name,dose,starts_on,ends_on,times,timezone,reminders_enabled)
values('Legacy long period','1',current_date-400,current_date,array['09:00'::time],'UTC',false);
""")
sql((root / 'supabase/migrations/20261113120000_medication_treatments.sql').read_text())
sql((root / 'supabase/migrations/20261114002349_medication_treatment_review_fixes.sql').read_text())
assert sql("select count(*) from health_medications where schedule_pending") == '1'
assert sql("select duration_days from health_medication_schedules where duration_kind='finite'") == '401'
for name in ('medication_treatments.sql', 'medication_regressions.sql', 'health_security.sql', 'medication_query_plans.sql'):
    print(sql((root / 'supabase/tests' / name).read_text()))

# Two creators have both observed absence (expected version zero).
med = sql(identity + """
select health_treatment_save(jsonb_build_object('name','Concurrency','dose','1',
 'mode','interval','timezone','UTC','anchor_date',(current_date-2)::text,
 'anchor_time','06:00','interval_minutes',480,'duration_kind','continuous',
 'reminders_enabled',false),gen_random_uuid())->>'id';
""")
slot = sql(identity + f"select scheduled_at from health_private.schedule_slots('{owner}','{med}',now()-interval '1 day',now()) order by scheduled_at desc limit 1;")
call = f"select health_dose_record('{med}','{slot}','taken',now(),'1','',0,gen_random_uuid());"
first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
second = None
try:
    first.stdin.write('begin;\n' + identity + '\n' + call + '\n\\echo FIRST_READY\n')
    first.stdin.flush()
    for line in first.stdout:
        if line.strip() == 'FIRST_READY':
            break
    else:
        raise AssertionError(first.stderr.read())
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second.stdin.write(identity + "set application_name='medical_concurrent_second';" + call)
    second.stdin.close()
    deadline = time.monotonic() + 15
    blocked = False
    while time.monotonic() < deadline and second.poll() is None:
        if sql("select count(*) from pg_stat_activity where application_name='medical_concurrent_second' and wait_event_type='Lock'") == '1':
            blocked = True
            break
    assert blocked, 'Second creator did not serialize on medication lock'
    first.stdin.write('commit;\n')
    first.stdin.close()
    assert first.wait(timeout=10) == 0, first.stderr.read()
    assert second.wait(timeout=10) != 0, 'Both creators committed'
    assert 'VERSION_CONFLICT' in second.stderr.read()
    assert sql(identity + f"select count(*) from health_doses where medication_id='{med}'") == '1'
    print('PASS: legacy upgrade and two concurrent creators; stale creator rejected')
finally:
    for process in (first, second):
        if process and process.poll() is None:
            process.kill()
