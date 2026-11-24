"""Apply canonical goal migration to an empty disposable PostgreSQL database.

Checks legacy upgrades and concurrent linking versus manual contributions.
Use PG* environment variables or --docker-container, never a populated database.
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
    return subprocess.run(command, input=source, text=True, capture_output=True, check=True).stdout.strip()


assert sql("select count(*) from pg_tables where schemaname='public'") == '0', 'Test database must be empty'
sql("""
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
""" + (root / 'src/tests/fixtures/mf-security-schema.sql').read_text())
sql("create function public.mf_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;")
for suffix in ('mf_security_ownership.sql', 'mf_safe_snapshots_and_ai_limits.sql',
               'mf_goal_contributions_transaction.sql', 'mf_atomic_finance_writes.sql', 'mf_review_consistency.sql'):
    files = list((root / 'supabase/migrations').glob('*_' + suffix))
    assert len(files) == 1
    sql(files[0].read_text())
owner = '11111111-1111-1111-1111-111111111111'
a = '22222222-2222-2222-2222-222222222222'
b = '33333333-3333-3333-3333-333333333333'
goal = '44444444-4444-4444-4444-444444444444'
sql(f"""
insert into auth.users(id) values('{owner}');
insert into mf_accounts(id,user_id,name,initial_balance) values
 ('{a}','{owner}','Account A',5000),('{b}','{owner}','Account B',3000);
insert into mf_goals(id,user_id,name,target_amount,account_id)
 values('{goal}','{owner}','Legacy goal',10000,'{a}');
""")
files = list((root / 'supabase/migrations').glob('*_multiple_goal_accounts.sql'))
assert len(files) == 1
sql(files[0].read_text())
assert sql(f"select account_ids=array['{a}'::uuid] from mf_goals where id='{goal}'") == 't'
sql(f"update mf_goals set account_ids='{{}}' where id='{goal}'")
first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
second = None
try:
    first.stdin.write(f"begin; update mf_goals set account_ids=array['{a}'::uuid,'{b}'::uuid] where id='{goal}';\n\\echo FIRST_READY\n")
    first.stdin.flush()
    for line in first.stdout:
        if line.strip() == 'FIRST_READY':
            break
    else:
        raise AssertionError(first.stderr.read())
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second.stdin.write(f"set application_name='mf_goal_concurrent_contribution'; insert into mf_goal_contributions(user_id,goal_id,kind,amount,contribution_date) values('{owner}','{goal}','DEPOSIT',100,current_date);")
    second.stdin.close()
    deadline = time.monotonic() + 15
    blocked = False
    while time.monotonic() < deadline and second.poll() is None:
        if sql("select count(*) from pg_stat_activity where application_name='mf_goal_concurrent_contribution' and wait_event_type='Lock'") == '1':
            blocked = True
            break
    assert blocked, 'Contribution must wait for goal mode update'
    first.stdin.write('commit;\n')
    first.stdin.close()
    assert first.wait(timeout=10) == 0, first.stderr.read()
    assert second.wait(timeout=10) != 0, 'Concurrent contribution incorrectly committed'
    assert 'mf_goal_linked_no_contributions' in second.stderr.read()
    assert sql(f"select count(*) from mf_goal_contributions where goal_id='{goal}'") == '0'
    sql(f"delete from mf_accounts where id='{a}'")
    assert sql(f"select account_ids=array['{b}'::uuid] and account_id='{b}'::uuid from mf_goals where id='{goal}'") == 't'
    print('PASS: legacy link preserved; concurrent contribution waits and is rejected; deleting one account preserves remaining link')
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
