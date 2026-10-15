import { describe, it, expect } from 'vitest';
import {
  MF_REMINDER_WINDOWS,
  invoiceDueISO,
  reminderDueISO,
  diffDays,
  planMFReminders,
} from './mfReminders';

const TODAY = '2026-10-15';
const accCorrente = { id: 'acc-1', name: 'Nuconta', account_type: 'CORRENTE', currency: 'BRL' };
const accCard = {
  id: 'acc-card',
  name: 'Nubank',
  account_type: 'CARTAO',
  currency: 'BRL',
  closing_day: 10,
  due_day: 20,
  linked_account_id: 'acc-1',
};
const byId = { 'acc-1': accCorrente, 'acc-card': accCard };

const tx = (over) => ({
  id: 'tx-1',
  account_id: 'acc-1',
  type: 'DESPESA',
  description: 'Luz',
  amount: 100,
  status: 'PENDENTE',
  payment_date: '2026-10-15',
  ...over,
});

describe('mfReminders — planejador puro', () => {
  it('janelas exatas D-3, D-0 e D+3 (sem spam nos outros dias)', () => {
    expect(MF_REMINDER_WINDOWS).toEqual({ UPCOMING: 3, TODAY: 0, OVERDUE: -3 });
    const kinds = (due) =>
      planMFReminders([tx({ id: 'a', payment_date: due })], {
        accountsById: byId,
        todayISO: TODAY,
      }).map((row) => row.kind);
    expect(kinds('2026-10-18')).toEqual(['upcoming']);
    expect(kinds('2026-10-15')).toEqual(['today']);
    expect(kinds('2026-10-12')).toEqual(['overdue']);
    expect(kinds('2026-10-17')).toEqual([]);
    expect(kinds('2026-10-16')).toEqual([]);
    expect(kinds('2026-10-14')).toEqual([]);
    expect(kinds('2026-10-11')).toEqual([]);
  });

  it('ignora PAGO, CANCELADO e TRANSFERENCIA (conta ignorada nos totais gera)', () => {
    const rows = [
      tx({ id: 'pago', status: 'PAGO', payment_date: '2026-10-15' }),
      tx({ id: 'canc', status: 'CANCELADO', payment_date: '2026-10-15' }),
      tx({
        id: 'transf',
        type: 'TRANSFERENCIA',
        transfer_account_id: 'acc-2',
        payment_date: '2026-10-15',
      }),
    ];
    expect(
      planMFReminders(rows, { accountsById: byId, todayISO: TODAY })
    ).toEqual([]);
  });

  it('despesa de cartão vence no vencimento da fatura, não na compra', () => {
    // fecha 10/10 → vence 20/10 (D >= C, mesmo mês)
    expect(invoiceDueISO(accCard, '2026-10-10')).toBe('2026-10-20');
    // fecha 10/01 com D < C venceria em fevereiro
    expect(
      invoiceDueISO({ closing_day: 20, due_day: 10 }, '2026-01-20')
    ).toBe('2026-02-10');
    const due = reminderDueISO(
      tx({
        id: 'card',
        account_id: 'acc-card',
        payment_date: '2026-10-02',
        invoice_close: '2026-10-10',
        due_date: null,
      }),
      byId
    );
    expect(due).toBe('2026-10-20');
  });

  it('due_date explícito tem prioridade; sem data não gera', () => {
    expect(
      reminderDueISO(
        tx({ payment_date: '2026-10-02', due_date: '2026-10-18' }),
        byId
      )
    ).toBe('2026-10-18');
    expect(
      planMFReminders(
        [tx({ id: 'nodate', payment_date: null, due_date: null })],
        { accountsById: byId, todayISO: TODAY }
      )
    ).toEqual([]);
  });

  it('ordena por vencimento e carrega conta/moeda/parcela', () => {
    const rows = [
      tx({ id: 'b', payment_date: '2026-10-15', amount: 50 }),
      tx({
        id: 'a',
        payment_date: '2026-10-12',
        amount: 300,
        installments_current: 2,
        installments_total: 12,
      }),
    ];
    const [first, second] = planMFReminders(rows, {
      accountsById: byId,
      todayISO: TODAY,
    });
    expect(first.txId).toBe('a');
    expect(first.kind).toBe('overdue');
    expect(first).toMatchObject({
      currency: 'BRL',
      accountName: 'Nuconta',
      installmentsCurrent: 2,
      installmentsTotal: 12,
    });
    expect(second.txId).toBe('b');
  });

  it('diffDays ignora fuso (datas ISO de calendário)', () => {
    expect(diffDays('2026-10-18', TODAY)).toBe(3);
    expect(diffDays('2026-10-15', TODAY)).toBe(0);
    expect(diffDays('2026-10-12', TODAY)).toBe(-3);
  });
});
