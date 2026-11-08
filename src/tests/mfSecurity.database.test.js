// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = (suffix) => {
  const root = new URL('../../supabase/migrations/', import.meta.url);
  const files = readdirSync(root).filter((name) => name.endsWith('_' + suffix));
  if (files.length !== 1) throw new Error('Expected one security migration: ' + suffix);
  return readFileSync(new URL(files[0], root), 'utf8');
};
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const accA = '20000000-0000-4000-8000-000000000001';
const accB = '20000000-0000-4000-8000-000000000002';
let pg;
const asUser = async (user = A) => { await pg.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`); };
const admin = async () => pg.exec('reset role;');

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    insert into auth.users values('${A}','a@example.test'),('${B}','b@example.test');`);
  await pg.exec(read('./fixtures/mf-security-schema.sql'));
  await pg.exec(`do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
      execute format('alter table public.%I enable row level security',t.tablename);
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='user_id') then
        execute format('create policy own on public.%I for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t.tablename);
      end if;
    end loop; end $$;
    grant select,insert,update,delete on all tables in schema public to authenticated;`);
  const source = read('../../supabase/migrations/20261026000000_mf_tx_links_investment.sql');
  await pg.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.mf_save_tx_linked')));
  const updated = read('../../supabase/migrations/20261003000000_create_minhas_financas_module.sql');
  await pg.exec(updated.slice(updated.indexOf('CREATE OR REPLACE FUNCTION public.mf_set_updated_at'),updated.indexOf('-- -------------------------------------------------------------',updated.indexOf('CREATE OR REPLACE FUNCTION public.mf_set_updated_at'))));
  await pg.exec(migration('mf_security_ownership.sql'));
  await pg.exec(migration('mf_safe_snapshots_and_ai_limits.sql'));
}, 60000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('begin;');
  await pg.query("insert into public.mf_accounts(id,user_id,name) values($1,$2,'A'),($3,$4,'B')", [accA,A,accB,B]);
});
afterEach(async () => { await pg.exec('rollback; reset role;'); });

describe('hardening SQL com PostgreSQL isolado, sem conexão à produção', () => {
  it('bloqueia acesso direto à tabela de vínculos', async () => {
    await asUser();
    await expect(pg.exec(`insert into public.mf_tx_links(transaction_id,user_id) values(gen_random_uuid(),'${A}')`)).rejects.toThrow(/permission denied/);
  });
  it('bloqueia FK de transação para conta de outro usuário', async () => {
    await asUser();
    await expect(pg.query("insert into public.mf_transactions(user_id,account_id,type,description,amount,payment_date) values($1,$2,'DESPESA','teste',1,current_date)",[A,accB])).rejects.toThrow(/mf_reference_not_authorized/);
  });
  it('RPC não permite usar a conta de outro usuário e faz rollback', async () => {
    await asUser();
    await expect(pg.query('select public.mf_save_tx_linked($1::jsonb)', [JSON.stringify({account_id:accB,type:'DESPESA',description:'teste',amount:1,payment_date:'2026-11-01'})])).rejects.toThrow(/mf_reference_not_authorized/);
  });
  it('RPC continua salvando uma transação legítima', async () => {
    await asUser();
    const r=await pg.query('select public.mf_save_tx_linked($1::jsonb) as id',[JSON.stringify({account_id:accA,type:'DESPESA',description:'teste',amount:1,payment_date:'2026-11-01'})]);
    expect(r.rows[0].id).toBeTruthy();
  });
  it('backup contém mais de 1000 registros e só o próprio usuário', async () => {
    await pg.query("insert into mf_transactions(user_id,account_id,type,description,amount,payment_date) select $1,$2,'DESPESA','fixture',1,current_date from generate_series(1,1100)",[A,accA]);
    await asUser();
    const r=await pg.query("select (public.mf_create_restore_point('teste')).payload as payload");
    expect(r.rows[0].payload.counts.mf_transactions).toBe(1100);
    expect(r.rows[0].payload.tables.mf_accounts).toHaveLength(1);
  });
  it('restauração faz merge, preserva registros novos e cria backup automático', async () => {
    await asUser();
    const point=await pg.query("select (public.mf_create_restore_point('antes')).id as id");
    await pg.query("update mf_accounts set name='alterado' where id=$1",[accA]);
    await pg.query("insert into mf_accounts(user_id,name) values($1,'conta nova')",[A]);
    const restored=await pg.query('select public.mf_restore_snapshot($1) as backup',[point.rows[0].id]);
    expect(restored.rows[0].backup).toBeTruthy();
    const accounts=await pg.query('select name from mf_accounts order by name');
    expect(accounts.rows.map(r=>r.name)).toEqual(['A','conta nova']);
  });
  it('recusa ponto de outro usuário sem alterar nada', async () => {
    await asUser(B);
    const point=await pg.query("select (public.mf_create_restore_point('de B')).id as id");
    await asUser(A);
    await expect(pg.query('select public.mf_restore_snapshot($1)',[point.rows[0].id])).rejects.toThrow(/mf_restore_not_found/);
  });
  it('bloqueia pontos legados, mantendo os dados', async () => {
    const point=await pg.query("insert into mf_restore_points(user_id,label,payload) values($1,'legado','{}') returning id",[A]);
    await asUser();
    await expect(pg.query('select public.mf_restore_snapshot($1)',[point.rows[0].id])).rejects.toThrow(/mf_legacy_snapshot_requires_review/);
  });
  it('limite de IA é por usuário e não permite acesso direto ao contador', async () => {
    await asUser();
    for(let i=0;i<10;i++) expect((await pg.query('select public.mf_consume_ai_budget() as allowed')).rows[0].allowed).toBe(true);
    expect((await pg.query('select public.mf_consume_ai_budget() as allowed')).rows[0].allowed).toBe(false);
    await asUser(B);
    expect((await pg.query('select public.mf_consume_ai_budget() as allowed')).rows[0].allowed).toBe(true);
    await admin();
  });
  it('integração legítima com investimento continua reversível', async () => {
    const inv=await pg.query("insert into investment_accounts(user_id,name,currency) values($1,'Investimento','BRL') returning id",[A]);
    const record=await pg.query("insert into investment_records(user_id,account_id,record_date,initial_balance,yield,final_balance) values($1,$2,'2026-11-01',1000,100,1100) returning id",[A,inv.rows[0].id]);
    await asUser();
    const saved=await pg.query('select mf_save_tx_linked($1::jsonb,null,null,$2) as id',[JSON.stringify({account_id:accA,type:'RECEITA',description:'Rendimento',amount:50,payment_date:'2026-11-02',status:'PAGO'}),inv.rows[0].id]);
    expect(Number((await pg.query('select yield from investment_records where id=$1',[record.rows[0].id])).rows[0].yield)).toBe(150);
    await pg.query('delete from mf_transactions where id=$1',[saved.rows[0].id]);
    expect(Number((await pg.query('select yield from investment_records where id=$1',[record.rows[0].id])).rows[0].yield)).toBe(100);
  });
  it('vínculo legado adulterado não altera investimento de terceiro ao excluir', async () => {
    const inv=await pg.query("insert into investment_accounts(user_id,name) values($1,'De B') returning id",[B]);
    const record=await pg.query("insert into investment_records(user_id,account_id,record_date,yield,final_balance) values($1,$2,'2026-11-01',100,100) returning id",[B,inv.rows[0].id]);
    const tx=await pg.query("insert into mf_transactions(user_id,account_id,type,description,amount,payment_date) values($1,$2,'DESPESA','próprio',1,current_date) returning id",[A,accA]);
    // Simula dados anteriores ao hardening. Apenas neste banco descartável.
    await pg.exec('alter table mf_tx_links disable trigger mf_validate_owner_refs');
    await pg.query('insert into mf_tx_links(transaction_id,user_id,investment_account_id,investment_record_id,investment_delta) values($1,$2,$3,$4,500)',[tx.rows[0].id,A,inv.rows[0].id,record.rows[0].id]);
    await pg.exec('alter table mf_tx_links enable trigger mf_validate_owner_refs');
    await asUser();
    await pg.query('delete from mf_transactions where id=$1',[tx.rows[0].id]);
    await admin();
    expect(Number((await pg.query('select yield from investment_records where id=$1',[record.rows[0].id])).rows[0].yield)).toBe(100);
  });
  it('falha no meio da restauração reverte contas e backup automático', async () => {
    await asUser();
    const point=await pg.query("select (mf_create_restore_point('ponto')).id as id");
    await pg.query("update mf_accounts set name='Manter' where id=$1",[accA]);
    await admin();
    const badGoal=JSON.stringify([{id:'30000000-0000-4000-8000-000000000001',user_id:A,name:'Inválido',account_id:accB,target_amount:1}]);
    await pg.query("update mf_restore_points set payload=jsonb_set(jsonb_set(payload,'{tables,mf_goals}',$2::jsonb),'{counts,mf_goals}','1') where id=$1",[point.rows[0].id,badGoal]);
    await asUser();
    await pg.exec('savepoint attempt');
    await expect(pg.query('select mf_restore_snapshot($1)',[point.rows[0].id])).rejects.toThrow();
    await pg.exec('rollback to savepoint attempt');
    expect((await pg.query('select name from mf_accounts where id=$1',[accA])).rows[0].name).toBe('Manter');
    expect((await pg.query('select count(*)::integer as n from mf_restore_points')).rows[0].n).toBe(1);
  });
  it('restaura junções sem coluna id', async () => {
    const tx=await pg.query("insert into mf_transactions(user_id,account_id,type,description,amount,payment_date) values($1,$2,'DESPESA','fixture',1,current_date) returning id",[A,accA]);
    const tag=await pg.query("insert into mf_tags(user_id,name) values($1,'Tag') returning id",[A]);
    await pg.query('insert into mf_transaction_tags(user_id,transaction_id,tag_id) values($1,$2,$3)',[A,tx.rows[0].id,tag.rows[0].id]);
    await asUser();
    const point=await pg.query("select (mf_create_restore_point('tags')).id as id");
    await pg.exec('delete from mf_transaction_tags');
    await pg.query('select mf_restore_snapshot($1)',[point.rows[0].id]);
    expect((await pg.query('select count(*)::integer as n from mf_transaction_tags')).rows[0].n).toBe(1);
  });
  it('usuário não pode adulterar snapshot nem contador de consumo', async () => {
    await asUser();
    await pg.exec('savepoint forbidden');
    await expect(pg.exec("insert into mf_restore_points(label,payload) values('forjado','{}')")).rejects.toThrow(/permission denied/);
    await pg.exec('rollback to savepoint forbidden');
    await expect(pg.exec('select * from mf_ai_usage')).rejects.toThrow(/permission denied/);
  });

  it('integração permite viagem compartilhada com WRITE e nega apenas READ', async () => {
    const trip=await pg.query("insert into trips(user_id,title) values($1,'Compartilhada') returning id",[B]);
    await pg.query("insert into trip_shares(trip_id,shared_by,shared_with_email,permission,status) values($1,$2,'a@example.test','READ','ACCEPTED')",[trip.rows[0].id,B]);
    await asUser();
    const tx=JSON.stringify({account_id:accA,type:'DESPESA',description:'Viagem',amount:20,payment_date:'2026-11-02',status:'PAGO'});
    await pg.exec('savepoint readonly');
    await expect(pg.query('select mf_save_tx_linked($1::jsonb,null,$2)',[tx,trip.rows[0].id])).rejects.toThrow(/mf_trip_not_authorized/);
    await pg.exec('rollback to savepoint readonly');
    await admin();await pg.query("update trip_shares set permission='WRITE' where trip_id=$1",[trip.rows[0].id]);
    await asUser();
    const saved=await pg.query('select mf_save_tx_linked($1::jsonb,null,$2) as id',[tx,trip.rows[0].id]);
    expect(saved.rows[0].id).toBeTruthy();
    expect((await pg.query('select count(*)::int as n from trip_expenses')).rows[0].n).toBe(1);
  });
  it('rotinas não são executáveis por anon e triggers não são RPCs de usuários', async () => {
    const privileges=await pg.query("select has_function_privilege('anon','public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric)','EXECUTE') as anonymous,has_function_privilege('authenticated','public.mf_cleanup_tx_links()','EXECUTE') as trigger_exposed");
    expect(privileges.rows[0]).toEqual({anonymous:false,trigger_exposed:false});
  });

});
