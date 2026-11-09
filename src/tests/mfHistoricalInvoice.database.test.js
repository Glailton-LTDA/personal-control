// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const readMigration = (suffix) => {
  const file = readdirSync(migrations).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`Missing migration: ${suffix}`);
  return readFileSync(new URL(file, migrations), 'utf8');
};
let pg;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create table public.mf_transactions (
    id integer primary key, notes text, invoice_close date, amount numeric,
    status text, effective_date date, payment_date date
  );`);
  await pg.exec(readMigration('_mf_block_historical_invoice_auto.sql'));
  // Existing scheduled payment that has become overdue since its creation.
  await pg.exec(`alter table mf_transactions disable trigger mf_block_historical_invoice_auto;
    insert into mf_transactions values
      (1, 'Agendado automaticamente (fatura)', (date_trunc('month', current_date) - interval '1 month')::date,
       250, 'PENDENTE', null, current_date - 40);
    alter table mf_transactions enable trigger mf_block_historical_invoice_auto;`);
}, 60000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec(readMigration('_mf_allow_historical_invoice_settlement.sql'));
});

describe('pagamento manual de fatura histórica', () => {
  it('permite quitar pelo lançamento existente e desfazer a quitação', async () => {
    await pg.exec("update mf_transactions set status='PAGO', effective_date=current_date where id=1");
    const paid = await pg.query('select status, effective_date = current_date as paid_today, amount from mf_transactions where id=1');
    expect(paid.rows[0]).toEqual({ status: 'PAGO', paid_today: true, amount: '250' });
    await pg.exec("update mf_transactions set status='PENDENTE', effective_date=null where id=1");
    expect((await pg.query('select status, effective_date from mf_transactions where id=1')).rows[0])
      .toEqual({ status: 'PENDENTE', effective_date: null });
  });

  it.each(['Agendado automaticamente (fatura)', 'Ajuste de fatura (reajuste de valor)'])(
    'continua bloqueando a criação histórica: %s', async (notes) => {
      await expect(pg.query(`insert into mf_transactions(id,notes,invoice_close,amount)
        values(2,$1,(date_trunc('month',current_date) - interval '1 month')::date,100)`, [notes]))
        .rejects.toThrow(/Agendador:/);
    }
  );

  it('continua bloqueando reajuste de valor do pagamento histórico', async () => {
    await expect(pg.exec('update mf_transactions set amount=300 where id=1'))
      .rejects.toThrow(/Agendador:/);
  });

  it('permite criar e reajustar pagamentos do mês corrente', async () => {
    await pg.exec(`insert into mf_transactions(id,notes,invoice_close,amount)
      values(3,'Agendado automaticamente (fatura)',current_date,100);
      update mf_transactions set amount=150 where id=3;`);
    expect((await pg.query('select amount from mf_transactions where id=3')).rows[0].amount).toBe('150');
  });
});
