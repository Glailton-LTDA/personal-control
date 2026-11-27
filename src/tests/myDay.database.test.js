// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = (suffix) => {
  const root = new URL('../../supabase/migrations/', import.meta.url);
  return readFileSync(
    new URL(
      readdirSync(root).find((f) => f.endsWith(suffix)),
      root
    ),
    'utf8'
  );
};
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222';
let pg;
const user = async (id = A) =>
  pg.exec(`set role authenticated;set request.jwt.claim.sub='${id}';`);
const summary = async (
  timezone = 'UTC',
  modules = ['health', 'minhasfinancas', 'trips']
) =>
  (
    await pg.query('select my_day_summary($1,$2::text[]) value', [
      timezone,
      modules,
    ])
  ).rows[0].value;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(read('../../supabase/tests/health_bootstrap.sql'));
  for (const suffix of [
    '20261015000000_mf_push_subscriptions.sql',
    '20261107112044_health_guide.sql',
    '20261107121840_global_push_notifications.sql',
    '20261107161433_health_scheduler_auth_resolution.sql',
    '20261109000149_health_appointment_followups.sql',
    '20261109021510_health_recent_lists_indexes.sql',
    '20261113120000_medication_treatments.sql',
    '20261114002349_medication_treatment_review_fixes.sql',
  ])
    await pg.exec(migration(suffix));
  await pg.exec(
    read('./fixtures/mf-security-schema.sql')
      .split('\n')
      .filter((line) => !line.includes('mf_push_subscriptions'))
      .join('\n')
  );
  // Canonical baseline itinerary definition, not a parallel feature schema.
  const baseline = migration('20200101000000_baseline_schema.sql');
  const start = baseline.indexOf('create table public.trip_itinerary (');
  await pg.exec(baseline.slice(start, baseline.indexOf('\n);', start) + 3));
  await pg.exec(`alter table trip_itinerary add primary key(id);
 do $$ declare t text;begin foreach t in array array['mf_accounts','mf_transactions','mf_invoices','trips','trip_itinerary'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy owner on %I to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
 end loop;end$$;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 insert into auth.users values('${A}'),('${B}');`);
  await pg.exec(migration('_my_day_summary.sql'));
}, 60000);
afterAll(async () => pg?.close());
beforeEach(async () => pg.exec('begin;'));
afterEach(async () => pg.exec('rollback;reset role;'));
it('denies anonymous execution', async () => {
  await pg.exec('set role anon');
  await expect(summary()).rejects.toThrow(/permission denied/);
});
it('denies an authenticated role without identity', async () => {
  await pg.exec("set role authenticated;set request.jwt.claim.sub=''");
  await expect(summary()).rejects.toThrow(/AUTH_REQUIRED/);
});
it('validates timezone and skips disabled modules', async () => {
  await user();
  await expect(summary('not-a-zone')).rejects.toThrow(/INVALID_TIMEZONE/);
});
it('returns a bounded empty read-only snapshot for an authenticated user', async () => {
  await user();
  const data = await summary();
  expect(Object.keys(data.sections)).toHaveLength(7);
  expect(
    Object.values(data.sections).every(
      (s) => s.rows.length === 0 && !s.has_more
    )
  ).toBe(true);
  expect((await summary('UTC', [])).sections).toEqual({});
});
it('keeps owner/date/status boundaries and signals truncated previews', async () => {
  await user();
  await pg.exec(`insert into health_appointments(user_id,name,starts_at,status)
 select '${A}','Own '||n,date_trunc('day',now())+interval '10 hours','scheduled' from generate_series(1,25) n;
 insert into health_appointments(user_id,name,starts_at,status) values
 ('${A}','Cancelled',now(),'cancelled'),('${A}','Outside',now()+interval '20 days','scheduled');`);
  await pg.exec('reset role');
  await user(B);
  await pg.exec(
    `insert into health_appointments(user_id,name,starts_at) values('${B}','Foreign',now())`
  );
  await pg.exec('reset role');
  await user();
  const data = await summary();
  expect(data.sections.appointments.rows).toHaveLength(20);
  expect(data.sections.appointments.has_more).toBe(true);
  expect(
    data.sections.appointments.rows.every((r) => r.title.startsWith('Own '))
  ).toBe(true);
  await pg.exec('reset role');
  await user(B);
  expect(
    (await summary()).sections.appointments.rows.map((r) => r.title)
  ).toEqual(['Foreign']);
});
it('returns pending account expenses and invoice remainders without card purchase duplication', async () => {
  await pg.exec(`insert into mf_accounts(id,user_id,name,account_type,currency) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','${A}','Bank','CORRENTE','BRL'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','${A}','Card','CARTAO','BRL');
 insert into mf_transactions(user_id,account_id,type,description,amount,payment_date,status) values
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','DESPESA','Due today',129.9,current_date,'PENDENTE'),
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','DESPESA','Paid',10,current_date,'PAGO'),
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','DESPESA','Card purchase',20,current_date,'PENDENTE'),
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','RECEITA','Income',20,current_date,'PENDENTE'),
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','DESPESA','Old expense',20,current_date-8,'PENDENTE');
 insert into mf_invoices(user_id,card_id,close_date,due_date,total,paid_total,status) values
 ('${A}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',current_date-10,current_date-1,1000,520,'OVERDUE');`);
  await user();
  const data = await summary();
  expect(data.sections.payments.rows.map((r) => r.title)).toEqual([
    'Due today',
  ]);
  expect(data.sections.payments.rows[0].amount).toBe(129.9);
  expect(data.sections.invoices.rows[0].amount).toBe(480);
});
it('returns only owned unfinished itinerary items and upcoming trips', async () => {
  await pg.exec(`insert into trips(id,user_id,title,start_date) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${A}','Own trip',current_date+2),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','${B}','Foreign trip',current_date+2);
 insert into trip_itinerary(trip_id,user_id,day,time,activity,completed) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${A}',current_date::text,'19:00','Hotel check-in',false),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${A}',current_date::text,'20:00','Legacy unmarked',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${A}',current_date::text,'18:00','Done',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','${A}',current_date::text,'18:00','Invalid reference',false);`);
  await user();
  const data = await summary();
  expect(data.sections.trips.rows.map((r) => r.title)).toEqual(['Own trip']);
  expect(data.sections.itinerary.rows.map((r) => r.title)).toEqual([
    'Hotel check-in',
    'Legacy unmarked',
  ]);
  expect((await summary('UTC', ['health'])).sections).not.toHaveProperty(
    'trips'
  );
});
it('uses the existing slot generator and record version without reading adherence history', async () => {
  await user();
  const saved = await pg.query(
    `select health_treatment_save(jsonb_build_object('name','Synthetic medicine','dose','1 capsule','mode','interval','timezone','UTC','anchor_date',current_date::text,'anchor_time','00:00','interval_minutes',480,'duration_kind','continuous','reminders_enabled',false),gen_random_uuid()) result`
  );
  const id = saved.rows[0].result.id;
  const data = await summary();
  expect(data.sections.doses.rows).toHaveLength(3);
  const slot = data.sections.doses.rows[0];
  expect(slot.medication_id).toBe(id);
  expect(slot.record_version).toBe(0);
  await pg.query(
    "select health_dose_record($1,$2,'taken',now(),'1 capsule','',0,gen_random_uuid())",
    [id, slot.scheduled_at]
  );
  const after = await summary();
  expect(after.sections.doses.rows[0].status).toBe('taken');
  expect(after.sections.doses.rows[0].record_version).toBeGreaterThan(0);
});
