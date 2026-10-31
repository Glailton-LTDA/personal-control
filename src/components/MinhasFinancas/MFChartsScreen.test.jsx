import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFChartsScreen from './MFChartsScreen';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts?.count != null ? `${key}:${opts.count}` : key),
    i18n: { language: 'pt-BR' },
  }),
}));

const accounts = [
  { id: 'acc-1', name: 'Caixinha Turbo', account_type: 'POUPANCA', currency: 'BRL' },
  { id: 'acc-2', name: 'Caixinha Carro', account_type: 'POUPANCA', currency: 'BRL' },
];

const groups = [
  {
    key: 'type:POUPANCA',
    name: 'Caixinhas',
    value: 8000,
    count: 2,
    color: '#22c55e',
    icon: '🐷',
    accounts: [
      { id: 'acc-1', name: 'Caixinha Turbo', value: 4500, account: accounts[0] },
      { id: 'acc-2', name: 'Caixinha Carro', value: 3500, account: accounts[1] },
    ],
  },
  {
    key: 'type:CORRENTE',
    name: 'Conta Corrente',
    value: 2000,
    count: 1,
    color: '#6366f1',
    icon: '🏦',
    accounts: [{ id: 'acc-3', name: 'Nuconta', value: 2000, account: { ...accounts[0], id: 'acc-3', name: 'Nuconta' } }],
  },
];

const baseProps = {
  chart: 'contas',
  grouping: 'type',
  categoryKey: null,
  monthKey: '2026-10',
  currencies: ['BRL', 'USD'],
  currency: 'BRL',
  groups,
  flow: [],
  options: { badges: true, percent: true, includeIgnored: false },
  testId: 'mf-charts',
};

describe('MFChartsScreen — tela cheia dos gráficos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista categorias e faz o drill-down até a conta', () => {
    const onSelectCategory = vi.fn();
    const onSelectAccount = vi.fn();
    const view = render(
      <MFChartsScreen
        {...baseProps}
        onSelectCategory={onSelectCategory}
        onSelectAccount={onSelectAccount}
      />
    );

    expect(screen.getByTestId('mf-charts-screen')).toBeInTheDocument();
    expect(screen.getByText('Caixinhas')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-charts-category-type:POUPANCA'));
    expect(onSelectCategory).toHaveBeenCalledWith('type:POUPANCA');

    view.rerender(
      <MFChartsScreen
        {...baseProps}
        categoryKey="type:POUPANCA"
        onSelectCategory={onSelectCategory}
        onSelectAccount={onSelectAccount}
      />
    );
    expect(screen.getByText('Caixinha Turbo')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-charts-account-acc-1'));
    expect(onSelectAccount).toHaveBeenCalledWith(accounts[0]);
  });

  it('troca métrica, moeda e agrupamento pelos seletores', () => {
    const onChangeChart = vi.fn();
    const onCurrencyChange = vi.fn();
    const onChangeGrouping = vi.fn();
    render(
      <MFChartsScreen
        {...baseProps}
        onChangeChart={onChangeChart}
        onCurrencyChange={onCurrencyChange}
        onChangeGrouping={onChangeGrouping}
      />
    );

    fireEvent.click(screen.getByTestId('mf-charts-metric'));
    fireEvent.click(screen.getByTestId('mf-charts-metric-option-despesas'));
    expect(onChangeChart).toHaveBeenCalledWith('despesas');

    fireEvent.click(screen.getByTestId('mf-charts-currency'));
    fireEvent.click(screen.getByTestId('mf-charts-currency-option-USD'));
    expect(onCurrencyChange).toHaveBeenCalledWith('USD');

    fireEvent.click(screen.getByTestId('mf-charts-grouping'));
    fireEvent.click(screen.getByTestId('mf-charts-grouping-option-institution'));
    expect(onChangeGrouping).toHaveBeenCalledWith('institution');
  });

  it('alterna pizza e barras', () => {
    render(<MFChartsScreen {...baseProps} />);
    fireEvent.click(screen.getByTestId('mf-charts-tab-bars'));
    expect(screen.getByTestId('mf-charts-tab-bars')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('mf-charts-tab-pie'));
    expect(screen.getByTestId('mf-charts-tab-pie')).toHaveAttribute('aria-selected', 'true');
  });

  it('no fluxo esconde o agrupamento e a lista de categorias', () => {
    render(
      <MFChartsScreen
        {...baseProps}
        chart="fluxo"
        grouping={null}
        groups={[]}
        flow={[{ key: '2026-10', label: 'out', receitas: 10, despesas: 5 }]}
      />
    );
    expect(screen.queryByTestId('mf-charts-grouping')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-charts-list')).not.toBeInTheDocument();
  });

  it('o botão voltar e o ⋮ ficam disponíveis', () => {
    const onBack = vi.fn();
    render(<MFChartsScreen {...baseProps} onBack={onBack} />);
    fireEvent.click(screen.getByTestId('mf-charts-back'));
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mf-charts-menu-toggle'));
    expect(screen.getByTestId('mf-charts-menu')).toBeInTheDocument();
  });
});
