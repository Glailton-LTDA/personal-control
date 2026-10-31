import { describe, it, expect } from 'vitest';
import {
  groupAccountsForChart,
  groupTransactionsForChart,
  limitChartLegend,
  chartPercent,
  chartTotal,
  rootGroupOf,
  UNGROUPED_KEY,
} from './mfCharts';

const groups = [
  { id: 'grp-nu', name: 'Nubank', parent_id: null, icon: '🟣', color: '#6366f1' },
  { id: 'grp-caixinha', name: 'Caixinhas', parent_id: 'grp-nu', icon: '🐷', color: '#22c55e' },
  { id: 'grp-mp', name: 'Mercado Pago', parent_id: null, icon: '💙', color: '#06b6d4' },
];

const rows = [
  { id: 'acc-nu', name: 'Nuconta', account_type: 'CORRENTE', saldo: 1000, group_id: 'grp-nu', icon: 'brand:nubank', color: '#6366f1' },
  { id: 'acc-cx', name: 'Caixinha Turbo', account_type: 'POUPANCA', saldo: 500, group_id: 'grp-caixinha', color: '#22c55e' },
  { id: 'acc-mp', name: 'Mercado Pago', account_type: 'CORRENTE', saldo: 300, group_id: 'grp-mp', color: '#06b6d4' },
  { id: 'acc-solto', name: 'Dinheiro', account_type: 'DINHEIRO', saldo: 50, group_id: null, color: '#f59e0b' },
];

const types = {
  CORRENTE: { label: 'Conta Corrente', icon: '🏦' },
  POUPANCA: { label: 'Caixinha', icon: '🐷' },
  DINHEIRO: { label: 'Dinheiro', icon: '💵' },
};

describe('mfCharts — agrupamento de contas', () => {
  it('por tipo soma os saldos e ordena do maior para o menor', () => {
    const result = groupAccountsForChart({ rows, groups, grouping: 'type', types });
    expect(result.map((item) => item.name)).toEqual([
      'Conta Corrente',
      'Caixinha',
      'Dinheiro',
    ]);
    expect(result[0]).toMatchObject({ value: 1300, count: 2 });
    expect(result[0].accounts.map((item) => item.id)).toEqual(['acc-nu', 'acc-mp']);
  });

  it('por instituição sobe até o grupo raiz (subgrupo entra no Nubank)', () => {
    const result = groupAccountsForChart({
      rows,
      groups,
      grouping: 'institution',
      types,
      labelUngrouped: 'Sem grupo',
    });
    const nubank = result.find((item) => item.name === 'Nubank');
    expect(nubank).toMatchObject({ value: 1500, count: 2 });
    expect(result.find((item) => item.name === 'Sem grupo')).toMatchObject({ value: 50 });
  });

  it('por grupo mantém o subgrupo separado do grupo raiz', () => {
    const result = groupAccountsForChart({
      rows,
      groups,
      grouping: 'group',
      types,
      labelUngrouped: 'Sem grupo',
    });
    expect(result.map((item) => item.name)).toEqual([
      'Nubank',
      'Caixinhas',
      'Mercado Pago',
      'Sem grupo',
    ]);
    expect(result.find((item) => item.name === 'Caixinhas')).toMatchObject({ value: 500 });
  });

  it('por conta usa o saldo individual', () => {
    const result = groupAccountsForChart({ rows, groups, grouping: 'account', types });
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ name: 'Nuconta', value: 1000, count: 1 });
  });

  it('conta sem grupo cai em "Sem grupo"', () => {
    const result = groupAccountsForChart({
      rows: [rows[3]],
      groups,
      grouping: 'institution',
      types,
      labelUngrouped: 'Sem grupo',
    });
    expect(result[0]).toMatchObject({ key: UNGROUPED_KEY, value: 50 });
  });

  it('rootGroupOf sobe a hierarquia e não entra em loop', () => {
    const map = new Map(groups.map((group) => [group.id, group]));
    expect(rootGroupOf('grp-caixinha', map)?.id).toBe('grp-nu');
    const cyclic = new Map([
      ['a', { id: 'a', parent_id: 'b' }],
      ['b', { id: 'b', parent_id: 'a' }],
    ]);
    expect(rootGroupOf('a', cyclic)).toBeTruthy();
  });
});

describe('mfCharts — agrupamento de lançamentos', () => {
  const txs = [
    { a: 'acc-nu', t: 'DESPESA', m: '2026-10', v: 100, cat: 'cat-food' },
    { a: 'acc-mp', t: 'DESPESA', m: '2026-10', v: 300, cat: 'cat-food' },
    { a: 'acc-cx', t: 'DESPESA', m: '2026-10', v: 50, cat: 'cat-travel' },
    { a: 'acc-nu', t: 'DESPESA', m: '2026-10', v: 25, cat: null },
    { a: 'acc-nu', t: 'RECEITA', m: '2026-10', v: 900, cat: null },
    { a: 'acc-nu', t: 'DESPESA', m: '2026-09', v: 700, cat: 'cat-food' },
  ];
  const accountsById = Object.fromEntries(rows.map((row) => [row.id, row]));
  const categoriesById = {
    'cat-food': { id: 'cat-food', name: 'Alimentação', color: '#f59e0b' },
    'cat-travel': { id: 'cat-travel', name: 'Viagem', color: '#06b6d4' },
  };

  it('por categoria soma as contas e ignora mês/tipo diferente', () => {
    const result = groupTransactionsForChart({
      txs,
      accountsById,
      categoriesById,
      type: 'DESPESA',
      month: '2026-10',
      grouping: 'category',
      labelUncategorized: 'Sem categoria',
    });
    expect(result.map((item) => item.name)).toEqual([
      'Alimentação',
      'Viagem',
      'Sem categoria',
    ]);
    expect(result[0]).toMatchObject({ value: 400, count: 2 });
    expect(result[0].accounts.map((item) => item.id)).toEqual(['acc-mp', 'acc-nu']);
  });

  it('por tipo de conta reaproveita o agrupamento das contas', () => {
    const result = groupTransactionsForChart({
      txs,
      accountsById,
      categoriesById,
      type: 'DESPESA',
      month: '2026-10',
      grouping: 'type',
      types,
    });
    expect(result[0]).toMatchObject({ name: 'Conta Corrente', value: 425 });
  });

  it('por instituição usa o grupo raiz', () => {
    const result = groupTransactionsForChart({
      txs,
      accountsById,
      categoriesById,
      type: 'DESPESA',
      month: '2026-10',
      grouping: 'institution',
      groups,
      labelUngrouped: 'Sem grupo',
    });
    expect(result.find((item) => item.name === 'Nubank')).toMatchObject({ value: 175 });
  });
});

describe('mfCharts — legenda e totais', () => {
  it('limita a 4 categorias + Outros N', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      key: `cat-${index}`,
      name: `Cat ${index}`,
      value: 100 - index * 10,
      count: 1,
    }));
    const { items: visible, other } = limitChartLegend(items, 4, 'Outros');
    expect(visible).toHaveLength(4);
    expect(other).toMatchObject({ name: 'Outros 3', value: 150, count: 3 });
    expect(other.groups).toHaveLength(3);
  });

  it('sem excedente não cria "Outros"', () => {
    const { other } = limitChartLegend([{ key: 'a', value: 1 }], 4, 'Outros');
    expect(other).toBeNull();
  });

  it('percentual e total consideram apenas saldos positivos', () => {
    expect(chartPercent(25, 100)).toBe(25);
    expect(chartPercent(1, 0)).toBe(0);
    expect(chartTotal([{ value: 100 }, { value: -20 }, { value: 50 }])).toBe(150);
  });
});
