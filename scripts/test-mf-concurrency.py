"""Disposable PostgreSQL regression: concurrent payments without pending rows.

Run against an EMPTY test database, using PG* variables or --docker-container.
The committed fixture and canonical migrations are the only schema sources.
"""
import argparse
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--docker-container')
parser.add_argument('--database', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
command = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', args.database]
if args.docker_container:
    command = ['docker', 'exec', '-i', args.docker_container, *command, '-U', 'postgres']


def sql(source):
    return subprocess.run(command, input=source, text=True, capture_output=True, check=True).stdout.strip()


bootstrap = """
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
"""
sql(bootstrap + (root / 'src/tests/fixtures/mf-security-schema.sql').read_text())
for suffix in ('_mf_goal_contributions_transaction.sql', '_mf_atomic_finance_writes.sql', '_mf_review_consistency.sql'):
    if suffix == '_mf_goal_contributions_transaction.sql':
        sql("create function public.mf_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;")
    files = list((root / 'supabase/migrations').glob('*' + suffix))
    assert len(files) == 1
    sql(files[0].read_text())
owner = '11111111-1111-1111-1111-111111111111'
card = '33333333-3333-3333-3333-333333333333'
bank = '44444444-4444-4444-4444-444444444444'
sql(f"""
insert into auth.users(id) values('{owner}');
insert into mf_accounts(id,user_id,name,account_type,linked_account_id) values
 ('{bank}','{owner}','Bank','CORRENTE',null),('{card}','{owner}','Card','CARTAO','{bank}');
insert into mf_transactions(user_id,account_id,type,description,amount,payment_date,status,invoice_close)
 values('{owner}','{card}','DESPESA','Purchase',800,'2026-10-01','PAGO','2026-10-10');
""")
payment = '{"account_id":"' + bank + '","type":"DESPESA","description":"Payment","amount":800,"payment_date":"2026-10-20","status":"PAGO"}'
call = f"select mf_pay_card_invoice('{card}','{bank}','2026-10-10','{payment}'::jsonb);"
identity = f"set request.jwt.claim.sub='{owner}';"
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
    second.stdin.write(identity + "set application_name='mf_concurrent_second';" + call)
    second.stdin.close()
    deadline = time.monotonic() + 15
    blocked = False
    while time.monotonic() < deadline and second.poll() is None:
        if sql("select count(*) from pg_stat_activity where application_name='mf_concurrent_second' and wait_event_type='Lock'") == '1':
            blocked = True
            break
    assert blocked, 'Second payment did not wait for the card lock'
    first.stdin.write('commit;\n')
    first.stdin.close()
    assert first.wait(timeout=10) == 0, first.stderr.read()
    assert second.wait(timeout=10) != 0, 'Both payments committed'
    assert 'mf_pay_card_settled' in second.stderr.read()
    assert sql(f"select sum(amount) from mf_transactions where account_id='{bank}'") == '800.00'
    print('PASS: second payment waited, revalidated the balance and rolled back')
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
