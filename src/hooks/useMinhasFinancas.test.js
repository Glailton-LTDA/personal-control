import { describe, it, expect, vi } from 'vitest';

// Módulos com efeito colateral (cliente Supabase/Dexie) — não interessam
// aqui: só testamos funções puras de cálculo.
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
}));

import { countableRows, groupTotalsByCurrency, computeMovementSplit, mfInstallmentSuffix, installmentHeadId, orderSeries } from './useMinhasFinancas';

describe('countableRows', () => {
  it('mantém as contas padrão e remove as marcadas com "Ignorar nos totais"', () => {
    const rows = [
      { id: 'a', saldo: 100 },
      { id: 'b', saldo: 50, ignore_in_totals: true },
      { id: 'c', saldo: 25, ignore_in_totals: false },
      { id: 'd', saldo: 10 }, // coluna ausente = não ignora
    ];
    expect(countableRows(rows).map((row) => row.id)).toEqual(['a', 'c', 'd']);
  });

  it('somas agregadas com countableRows ficam fora do total geral', () => {
    const rows = [
      { id: 'a', currency: 'BRL', saldo: 100 },
      { id: 'b', currency: 'BRL', saldo: 50, ignore_in_totals: true },
    ];
    expect(groupTotalsByCurrency(rows, 'saldo')).toEqual({ BRL: 150 });
    expect(groupTotalsByCurrency(countableRows(rows), 'saldo')).toEqual({ BRL: 100 });
  });
});

describe('mfInstallmentSuffix', () => {
  it('monta "N/M" só para série parcelada', () => {
    expect(mfInstallmentSuffix({ installments_current: 1, installments_total: 10 })).toBe(' 1/10');
    expect(mfInstallmentSuffix({})).toBe('');
    expect(mfInstallmentSuffix({ installments_total: 1 })).toBe('');
    expect(mfInstallmentSuffix(null)).toBe('');
  });
});

describe('computeMovementSplit', () => {
  const START = '2026-10-01';
  const END = '2026-10-31';
  const base = { account_id: 'acc-1', payment_date: '2026-10-05', status: 'PAGO' };

  it('separa efetivadas (PAGO) de pendentes por tipo e direção', () => {
    const txs = [
      { ...base, id: 'r1', type: 'RECEITA', amount: 200, status: 'PAGO' },
      { ...base, id: 'r2', type: 'RECEITA', amount: 50, status: 'PENDENTE' },
      { ...base, id: 'd1', type: 'DESPESA', amount: 100, status: 'PAGO' },
      { ...base, id: 'd2', type: 'DESPESA', amount: 30, status: 'PENDENTE' },
      { ...base, id: 't1', type: 'TRANSFERENCIA', amount: 500, transfer_account_id: 'acc-2', status: 'PAGO' },
      { ...base, id: 't2', type: 'TRANSFERENCIA', amount: 70, transfer_account_id: 'acc-2', status: 'PENDENTE' },
      { ...base, id: 't3', type: 'TRANSFERENCIA', amount: 40, account_id: 'acc-2', transfer_account_id: 'acc-1', status: 'PAGO' },
    ];
    expect(computeMovementSplit(txs, 'acc-1', START, END)).toEqual({
      receitas: { pago: 200, pendente: 50 },
      despesas: { pago: 100, pendente: 30 },
      transfIn: { pago: 40, pendente: 0 },
      transfOut: { pago: 500, pendente: 70 },
    });
  });

  it('ignora canceladas, fora do mês e de outras contas', () => {
    const txs = [
      { ...base, id: 'c1', type: 'RECEITA', amount: 999, status: 'CANCELADO' },
      { ...base, id: 'o1', type: 'RECEITA', amount: 999, payment_date: '2026-09-30' },
      { ...base, id: 'o2', type: 'DESPESA', amount: 999, account_id: 'acc-9' },
    ];
    expect(computeMovementSplit(txs, 'acc-1', START, END)).toEqual({
      receitas: { pago: 0, pendente: 0 },
      despesas: { pago: 0, pendente: 0 },
      transfIn: { pago: 0, pendente: 0 },
      transfOut: { pago: 0, pendente: 0 },
    });
  });
});

describe('installmentHeadId / orderSeries', () => {
  it('identifica a cabeça (filha aponta o pai; cabeça tem total > 1)', () => {
    expect(installmentHeadId({ id: 'c1', parent_transaction_id: 'h1' })).toBe('h1');
    expect(installmentHeadId({ id: 'h1', installments_total: 10 })).toBe('h1');
    expect(installmentHeadId({ id: 'x', installments_total: 1 })).toBeNull();
    expect(installmentHeadId({ id: 'y' })).toBeNull();
    expect(installmentHeadId(null)).toBeNull();
  });

  it('ordena por nº da parcela (desempate: vencimento)', () => {
    const rows = [
      { id: 'c3', installments_current: 3, payment_date: '2026-12-15' },
      { id: 'c1', installments_current: 1, payment_date: '2026-10-15' },
      { id: 'c2', installments_current: 2, payment_date: '2026-11-15' },
    ];
    expect(orderSeries(rows).map((row) => row.id)).toEqual(['c1', 'c2', 'c3']);
  });
});
