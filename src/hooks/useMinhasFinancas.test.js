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

import { countableRows, groupTotalsByCurrency, computeMovementSplit, computeStatement, mfInstallmentSuffix, installmentHeadId, orderSeries, isRecurrentTx, formatMoney } from './useMinhasFinancas';

describe('formatMoney', () => {
  it('escopo "all" da tela não é moeda — cai no padrão BRL (não Lek albanês)', () => {
    // 'ALL' é código ISO válido (Lek albanês): o escopo "Todas as
    // moedas" vazava como "ALL 15.031,10" nos widgets do Resumo.
    const brl = formatMoney(15031.1);
    expect(brl).toContain('15.031,10');
    expect(formatMoney(15031.1, 'all')).toBe(brl);
    expect(formatMoney(15031.1, 'ALL')).toBe(brl);
    // moeda de verdade segue nativa
    expect(formatMoney(10, 'USD')).toContain('US$');
  });
});

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

  it('despesa de cartão com fatura conta no mês da fatura', () => {
    const card = { id: 'acc-card', account_type: 'CARTAO' };
    const txs = [
      // 11/10 vinculada a novembro → fora de outubro, dentro de novembro
      { ...base, id: 'nov', account_id: 'acc-card', type: 'DESPESA', amount: 10, payment_date: '2026-10-11', status: 'PAGO', invoice_close: '2026-11-14' },
      // sem vínculo → mês da data
      { ...base, id: 'oct', account_id: 'acc-card', type: 'DESPESA', amount: 20, payment_date: '2026-10-05', status: 'PAGO', invoice_close: null },
    ];
    expect(computeMovementSplit(txs, 'acc-card', START, END, [card]).despesas).toEqual({
      pago: 20,
      pendente: 0,
    });
    expect(
      computeMovementSplit(txs, 'acc-card', '2026-11-01', '2026-11-30', [card]).despesas
    ).toEqual({ pago: 10, pendente: 0 });
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

describe('isRecurrentTx', () => {
  it('avulso não é recorrente', () => {
    expect(isRecurrentTx(null)).toBe(false);
    expect(isRecurrentTx({})).toBe(false);
    expect(isRecurrentTx({ recurrence: 'NONE' })).toBe(false);
    expect(isRecurrentTx({ installments_total: 1 })).toBe(false);
  });

  it('fixa, com recorrência ou de parcelado é recorrente', () => {
    expect(isRecurrentTx({ is_fixed: true })).toBe(true);
    expect(isRecurrentTx({ recurrence: 'MONTHLY' })).toBe(true);
    expect(isRecurrentTx({ recurrence: 'WEEKLY' })).toBe(true);
    expect(isRecurrentTx({ installments_total: 12 })).toBe(true);
    expect(isRecurrentTx({ parent_transaction_id: 'head' })).toBe(true);
  });
});

describe('computeStatement — extrato do cartão segue a fatura', () => {
  const card = { id: 'acc-card', name: 'Cartão', account_type: 'CARTAO', currency: 'BRL', initial_balance: 0 };
  const txs = [
    // 11/10 vinculada a novembro → extrato de novembro (agrupada em 11/10), fora de outubro
    { id: 'nov', account_id: 'acc-card', type: 'DESPESA', description: 'Teste Nov', amount: 10, payment_date: '2026-10-11', status: 'PAGO', category_id: null, invoice_close: '2026-11-14' },
    // sem vínculo → mês da data
    { id: 'oct', account_id: 'acc-card', type: 'DESPESA', description: 'Compra Out', amount: 20, payment_date: '2026-10-05', status: 'PAGO', category_id: null, invoice_close: null },
  ];

  it('outubro exclui a vinculada a novembro', () => {
    const { groups } = computeStatement({
      accounts: [card],
      transactions: txs,
      start: '2026-10-01',
      end: '2026-10-31',
      accountId: 'acc-card',
    });
    expect(groups.flatMap((group) => group.items.map((item) => item.tx.id))).toEqual(['oct']);
  });

  it('novembro inclui a vinculada, agrupada pela data de lançamento', () => {
    const { groups } = computeStatement({
      accounts: [card],
      transactions: txs,
      start: '2026-11-01',
      end: '2026-11-30',
      accountId: 'acc-card',
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-10-11');
    expect(groups[0].items.map((item) => item.tx.id)).toEqual(['nov']);
  });
});
