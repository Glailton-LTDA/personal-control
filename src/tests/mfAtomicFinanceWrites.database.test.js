// @vitest-environment node
import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const readMigration = (suffix) => {
  const file = readdirSync(migrations).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`Missing migration: ${suffix}`);
  return readFileSync(new URL(file, migrations), 'utf8');
};

/**
 * A migração concede/revoga para os papéis do Supabase (`anon`,
 * `authenticated`), que não existem no PGlite. As permissões são
 * verificadas no banco real — aqui só o corpo da função importa.
 */
const readFunctionMigration = (suffix) =>
  readMigration(suffix)
    .split('\n')
    .filter((line) => !/^\s*(revoke|grant)\s/i.test(line))
    .join('\n');

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CARD = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';
const TRIP = '55555555-5555-5555-5555-555555555555';
const GOAL = '66666666-6666-6666-6666-666666666666';
const CLOSE = '2026-10-10';
const MONTHS = ['2026-10-05', '2026-11-05', '2026-12-05'];
const ALIEN = 'abababab-abab-abab-abab-abababababab';

let pg;

const schema = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('mf.test_uid', true), '')::uuid $$;

create table public.mf_accounts (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  account_type text not null default 'CORRENTE',
  currency text,
  initial_balance numeric(14,2) not null default 0,
  linked_account_id uuid
);

create table public.mf_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null,
  transfer_account_id uuid,
  type text not null,
  description text not null,
  amount numeric(14,2) not null,
  payment_date date not null,
  due_date date,
  effective_date date,
  status text not null default 'PENDENTE',
  category_id uuid,
  responsible_id uuid,
  notes text,
  attachment_path text,
  recurrence text not null default 'NONE',
  installments_current integer,
  installments_total integer,
  parent_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_close date,
  is_fixed boolean not null default false,
  email_sent boolean not null default false,
  auto_settle boolean not null default false
);

create table public.mf_tx_links (
  transaction_id uuid primary key,
  user_id uuid not null,
  trip_id uuid,
  trip_expense_id uuid,
  investment_account_id uuid,
  investment_record_id uuid,
  investment_delta numeric,
  investment_created boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.trips (id uuid primary key, user_id uuid not null);

create table public.investment_accounts (
  id uuid primary key,
  user_id uuid not null,
  currency text
);

create table public.investment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null,
  record_date date not null,
  initial_balance numeric not null default 0,
  yield numeric not null default 0,
  final_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  user_id uuid not null,
  amount numeric,
  currency text,
  date date,
  description text,
  paid_by text,
  status text,
  category_id uuid
);

create table public.mf_goals (
  id uuid primary key,
  user_id uuid not null,
  name text,
  target_amount numeric,
  initial_amount numeric,
  status text,
  account_id uuid,
  color text,
  icon text
);

create table public.mf_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null,
  kind text not null,
  amount numeric(14,2) not null,
  contribution_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  transaction_id uuid,
  updated_at timestamptz
);

create unique index uq_mf_goal_contributions_transaction
  on public.mf_goal_contributions(transaction_id)
  where transaction_id is not null;
`;

const seed = async () => {
  await pg.exec(`
    delete from public.mf_goal_contributions;
    delete from public.mf_tx_links;
    delete from public.trip_expenses;
    delete from public.mf_transactions;
    delete from public.mf_accounts;
    delete from public.mf_goals;
    delete from public.trips;
    insert into public.mf_accounts (id, user_id, name, account_type, currency, linked_account_id)
      values ('${BANK}', '${OWNER}', 'Conta', 'CORRENTE', 'BRL', null),
             ('${CARD}', '${OWNER}', 'Cartão', 'CARTAO', 'BRL', '${BANK}'),
             ('${ALIEN}', '${OTHER}', 'Conta alheia', 'CORRENTE', 'BRL', null);
    insert into public.trips (id, user_id) values ('${TRIP}', '${OWNER}');
    insert into public.mf_goals (id, user_id, name, target_amount, status)
      values ('${GOAL}', '${OWNER}', 'Meta', 1000, 'ACTIVE');
  `);
};

const rows = async (sql, params = []) => (await pg.query(sql, params)).rows;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(schema);
  await pg.exec(readFunctionMigration('_mf_atomic_finance_writes.sql'));
}, 60000);

beforeEach(async () => {
  await pg.query(`select set_config('mf.test_uid', $1, false)`, [OWNER]);
  await seed();
});

describe('mf_save_tx_linked — série linked', () => {
  const head = (over = {}) => ({
    user_id: OWNER,
    account_id: BANK,
    type: 'DESPESA',
    description: 'Compra',
    amount: 300,
    payment_date: '2026-10-05',
    status: 'PAGO',
    ...over,
  });

  it('grava as filhas também na edição (converte um avulso em 3 parcelas)', async () => {
    const headId = await rows(
      `select mf_save_tx_linked($1::jsonb, null, $2::uuid, null, '[]'::jsonb, null, null) as id`,
      [JSON.stringify(head()), TRIP]
    );
    const id = headId[0].id;

    const children = [1, 2, 3].map((n) => ({
      ...head({ amount: 100, payment_date: MONTHS[n - 1] }),
      id: `7777777${n}-7777-7777-7777-777777777777`,
      parent_transaction_id: id,
      installments_current: n,
      installments_total: 3,
    }));
    await rows(
      `select mf_save_tx_linked($1::jsonb, $2::uuid, $3::uuid, null, $4::jsonb, null, null) as id`,
      [
        JSON.stringify({ ...head({ amount: 100 }), installments_total: 3, installments_current: 1 }),
        id,
        TRIP,
        JSON.stringify(children),
      ]
    );

    const saved = await rows(
      `select id, amount, installments_current, parent_transaction_id
         from public.mf_transactions where parent_transaction_id = $1 order by installments_current`,
      [id]
    );
    expect(saved).toHaveLength(3);
    expect(saved.map((row) => Number(row.amount))).toEqual([100, 100, 100]);

    const headRow = await rows(
      `select installments_total from public.mf_transactions where id = $1`,
      [id]
    );
    expect(Number(headRow[0].installments_total)).toBe(3);

    // O espelho da viagem continua em pé (um por lançamento).
    const mirrors = await rows(`select id from public.trip_expenses where trip_id = $1`, [TRIP]);
    expect(mirrors).toHaveLength(1);
  });

  it('não grava nada quando uma filha é inválida (original e espelho intactos)', async () => {
    const created = await rows(
      `select mf_save_tx_linked($1::jsonb, null, $2::uuid, null, '[]'::jsonb, null, null) as id`,
      [JSON.stringify(head()), TRIP]
    );
    const id = created[0].id;
    const before = await rows(`select * from public.mf_transactions where id = $1`, [id]);
    const mirrorsBefore = await rows(`select * from public.trip_expenses`);

    // A terceira filha aponta para uma conta de outro usuário: a RPC recusa.
    const children = [1, 2, 3].map((n) => ({
      ...head({ amount: 100, payment_date: MONTHS[n - 1] }),
      id: `8888888${n}-8888-8888-8888-888888888888`,
      parent_transaction_id: id,
      account_id: n === 3 ? ALIEN : BANK,
      installments_current: n,
      installments_total: 3,
    }));

    await expect(
      pg.query(
        `select mf_save_tx_linked($1::jsonb, $2::uuid, $3::uuid, null, $4::jsonb, null, null)`,
        [
          JSON.stringify({ ...head({ amount: 100 }), installments_total: 3 }),
          id,
          TRIP,
          JSON.stringify(children),
        ]
      )
    ).rejects.toThrow(/mf_tx_link_child_account/);

    const after = await rows(`select * from public.mf_transactions where id = $1`, [id]);
    expect(after[0].amount).toBe(before[0].amount);
    expect(after[0].installments_total).toBe(before[0].installments_total);
    const mirrorsAfter = await rows(`select * from public.trip_expenses`);
    expect(mirrorsAfter).toEqual(mirrorsBefore);
    const childrenSaved = await rows(
      `select id from public.mf_transactions where parent_transaction_id = $1`,
      [id]
    );
    expect(childrenSaved).toHaveLength(0);
  });

  it('recusa filha com pai diferente da cabeça', async () => {
    await expect(
      pg.query(
        `select mf_save_tx_linked($1::jsonb, null, null, null, $2::jsonb, null, null)`,
        [
          JSON.stringify(head()),
          JSON.stringify([
            {
              ...head({ amount: 100 }),
              id: '99999999-9999-9999-9999-999999999999',
              parent_transaction_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            },
          ]),
        ]
      )
    ).rejects.toThrow(/mf_tx_link_child_parent/);
  });
});

describe('mf_pay_card_invoice — pagamento transacional', () => {
  beforeEach(async () => {
    await pg.query(
      `insert into public.mf_transactions
         (id, user_id, account_id, type, description, amount, payment_date, status, invoice_close)
       values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', $1, $2, 'DESPESA', 'Compra no cartão',
               800, '2026-09-20', 'PAGO', $3)`,
      [OWNER, CARD, CLOSE]
    );
    // Espelho do agendador: pagamento PENDENTE da fatura na conta vinculada.
    await pg.query(
      `insert into public.mf_transactions
         (id, user_id, account_id, type, description, amount, payment_date, status, invoice_close, notes)
       values ('ffffffff-ffff-ffff-ffff-ffffffffffff', $1, $2, 'DESPESA', 'Pagamento de fatura',
               800, '2026-10-20', 'PENDENTE', $3, 'Agendado automaticamente (fatura)')`,
      [OWNER, BANK, CLOSE]
    );
  });

  it('paga reusando a linha agendada e grava os extras na mesma transação', async () => {
    const result = await rows(
      `select mf_pay_card_invoice($1::uuid, $2::uuid, $3::date, $4::jsonb, $5::jsonb, false, 800) as r`,
      [
        CARD,
        BANK,
        CLOSE,
        JSON.stringify({
          user_id: OWNER,
          account_id: BANK,
          type: 'DESPESA',
          description: 'Pagamento de fatura — Cartão',
          amount: 800,
          payment_date: '2026-10-04',
          status: 'PAGO',
          invoice_close: CLOSE,
          notes: null,
        }),
        JSON.stringify([
          {
            id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            user_id: OWNER,
            account_id: BANK,
            type: 'DESPESA',
            description: 'Encargos de fatura',
            amount: 50,
            payment_date: '2026-10-04',
            status: 'PAGO',
            notes: 'Encargos de fatura',
          },
        ]),
      ]
    );
    expect(result[0].r.extra_ids).toHaveLength(1);

    const paid = await rows(
      `select id, amount, status, notes from public.mf_transactions
        where account_id = $1 and type = 'DESPESA' and invoice_close = $2`,
      [BANK, CLOSE]
    );
    // O espelho pendente foi REUSADO (um único débito por fatura) e o
    // marcador do agendador saiu — não ficou linha duplicada.
    expect(paid).toHaveLength(1);
    expect(paid[0].id).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(Number(paid[0].amount)).toBe(800);
    expect(paid[0].status).toBe('PAGO');
    expect(paid[0].notes).toBeNull();
    const charges = await rows(
      `select amount from public.mf_transactions where notes = 'Encargos de fatura'`
    );
    expect(Number(charges[0].amount)).toBe(50);
  });

  it('não deixa o pagamento pela metade quando um extra é inválido', async () => {
    const before = await rows(`select * from public.mf_transactions order by id`);

    await expect(
      pg.query(
        `select mf_pay_card_invoice($1::uuid, $2::uuid, $3::date, $4::jsonb, $5::jsonb, false, 800)`,
        [
          CARD,
          BANK,
          CLOSE,
          JSON.stringify({
            user_id: OWNER,
            account_id: BANK,
            type: 'DESPESA',
            description: 'Pagamento de fatura',
            amount: 800,
            payment_date: '2026-10-04',
            status: 'PAGO',
            invoice_close: CLOSE,
          }),
          JSON.stringify([
            {
              id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
              user_id: OWNER,
              account_id: BANK,
              type: 'DESPESA',
              description: 'Parcela',
              amount: 100,
              payment_date: '2026-11-20',
              status: 'PAGO',
            },
            {
              id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
              user_id: OWNER,
              account_id: ALIEN,
              type: 'DESPESA',
              description: 'Parcela alheia',
              amount: 100,
              payment_date: '2026-12-20',
              status: 'PAGO',
            },
          ]),
        ]
      )
    ).rejects.toThrow(/mf_pay_card_extra_account/);

    const after = await rows(`select * from public.mf_transactions order by id`);
    expect(after).toEqual(before);
  });

  it('recusa pagamento acima do saldo financiável', async () => {
    await expect(
      pg.query(
        `select mf_pay_card_invoice($1::uuid, $2::uuid, $3::date, $4::jsonb, '[]'::jsonb, false, 800)`,
        [
          CARD,
          BANK,
          CLOSE,
          JSON.stringify({
            user_id: OWNER,
            account_id: BANK,
            type: 'DESPESA',
            description: 'Pagamento',
            amount: 5000,
            payment_date: '2026-10-04',
            status: 'PAGO',
            invoice_close: CLOSE,
          }),
        ]
      )
    ).rejects.toThrow(/mf_pay_card_amount/);
  });

  it('recusa pagamento de fatura de outro cartão', async () => {
    await expect(
      pg.query(
        `select mf_pay_card_invoice($1::uuid, $2::uuid, $3::date, null, '[]'::jsonb, true, null)`,
        [CARD, BANK, CLOSE]
      )
    ).resolves.toBeTruthy();

    await pg.query(`update public.mf_accounts set user_id = $1 where id = $2`, [OTHER, CARD]);
    await expect(
      pg.query(
        `select mf_pay_card_invoice($1::uuid, $2::uuid, $3::date, null, '[]'::jsonb, true, null)`,
        [CARD, BANK, CLOSE]
      )
    ).rejects.toThrow(/mf_pay_card_not_found/);
  });
});

describe('mf_save_tx_with_goal — receita + aporte', () => {
  const income = {
    user_id: OWNER,
    account_id: BANK,
    type: 'RECEITA',
    description: 'Salário',
    amount: 1000,
    payment_date: '2026-10-05',
    status: 'PAGO',
  };

  const contribution = {
    user_id: OWNER,
    goal_id: GOAL,
    kind: 'DEPOSIT',
    amount: 1000,
    contribution_date: '2026-10-05',
    notes: null,
  };

  it('grava a receita e o aporte juntos', async () => {
    const op = '12121212-1212-1212-1212-121212121212';
    await rows(`select mf_save_tx_with_goal($1::uuid, $2::jsonb, $3::jsonb, false) as r`, [
      op,
      JSON.stringify(income),
      JSON.stringify(contribution),
    ]);

    const txs = await rows(`select id, amount from public.mf_transactions`);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe(op);
    const contributions = await rows(
      `select goal_id, amount, transaction_id from public.mf_goal_contributions`
    );
    expect(contributions).toHaveLength(1);
    expect(contributions[0].transaction_id).toBe(op);
    expect(Number(contributions[0].amount)).toBe(1000);
  });

  it('o retry com o mesmo id da operação não duplica a receita', async () => {
    const op = '13131313-1313-1313-1313-131313131313';
    await rows(`select mf_save_tx_with_goal($1::uuid, $2::jsonb, $3::jsonb, false)`, [
      op,
      JSON.stringify(income),
      JSON.stringify(contribution),
    ]);
    // Retry: mesmo id, mesma operação.
    await rows(`select mf_save_tx_with_goal($1::uuid, $2::jsonb, $3::jsonb, false)`, [
      op,
      JSON.stringify(income),
      JSON.stringify(contribution),
    ]);

    const txs = await rows(`select id from public.mf_transactions`);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe(op);
    const contributions = await rows(`select id from public.mf_goal_contributions`);
    expect(contributions).toHaveLength(1);
  });

  it('não deixa receita gravada quando o aporte é recusado', async () => {
    const op = '14141414-1414-1414-1414-141414141414';
    await expect(
      pg.query(`select mf_save_tx_with_goal($1::uuid, $2::jsonb, $3::jsonb, false)`, [
        op,
        JSON.stringify(income),
        JSON.stringify({ ...contribution, goal_id: 'abababab-abab-abab-abab-abababababab' }),
      ])
    ).rejects.toThrow(/mf_goal_contribution_goal/);

    const txs = await rows(`select id from public.mf_transactions`);
    expect(txs).toHaveLength(0);
  });
});
