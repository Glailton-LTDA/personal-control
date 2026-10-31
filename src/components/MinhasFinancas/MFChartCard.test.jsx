import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFChartCard from './MFChartCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts?.count != null ? `${key}:${opts.count}` : key),
    i18n: { language: 'pt-BR' },
  }),
}));

const groups = Array.from({ length: 5 }, (_, index) => ({
  key: `type:T${index}`,
  name: `Categoria ${index + 1}`,
  value: 1000 - index * 100,
  count: index + 1,
  color: '#6366f1',
  icon: '🏦',
  accounts: [],
}));

const baseProps = {
  title: 'Contas por categoria',
  currency: 'BRL',
  groups,
  expanded: false,
  options: { badges: false, percent: true, includeIgnored: false },
  testId: 'mf-chart-test',
  emptyTestId: 'mf-chart-test-empty',
};

describe('MFChartCard — shell dos gráficos do Resumo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resume a legenda em 4 categorias + Outros N', () => {
    render(<MFChartCard {...baseProps} />);
    expect(screen.getByTestId('mf-chart-test-pill-type:T0')).toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-test-pill-type:T3')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-test-pill-type:T4')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-test-pill-other')).toHaveTextContent('common.other 1');
    expect(screen.getByTestId('mf-chart-test')).toHaveTextContent(
      'minhasfinancas.chart_categories_count:5'
    );
  });

  it('a seta expande a lista com valores e volta ao resumo', () => {
    const onToggle = vi.fn();
    const view = render(<MFChartCard {...baseProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('mf-chart-test-toggle'));
    expect(onToggle).toHaveBeenCalled();

    view.rerender(<MFChartCard {...baseProps} expanded onToggle={onToggle} />);
    expect(screen.getByTestId('mf-chart-test-legend-type:T4')).toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-test-legend-type:T0')).toHaveTextContent(
      'R$ 1.000,00'
    );
  });

  it('o menu ⋮ alterna badges, percentual e ignoradas', () => {
    const onOptionsChange = vi.fn();
    render(<MFChartCard {...baseProps} onOptionsChange={onOptionsChange} />);

    fireEvent.click(screen.getByTestId('mf-chart-test-menu-toggle'));
    fireEvent.click(screen.getByTestId('mf-chart-test-opt-badges'));
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ badges: true })
    );

    fireEvent.click(screen.getByTestId('mf-chart-test-opt-ignored'));
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeIgnored: true })
    );
  });

  it('clicar numa categoria e no ⤢ abre a tela cheia', () => {
    const onSelectGroup = vi.fn();
    const onOpen = vi.fn();
    render(
      <MFChartCard {...baseProps} onSelectGroup={onSelectGroup} onOpen={onOpen} />
    );

    fireEvent.click(screen.getByTestId('mf-chart-test-pill-type:T1'));
    expect(onSelectGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Categoria 2' }));

    fireEvent.click(screen.getByTestId('mf-chart-test-open'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('mostra o estado vazio com o testid do card', () => {
    render(<MFChartCard {...baseProps} groups={[]} />);
    expect(screen.getByTestId('mf-chart-test-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-test-pill-type:T0')).not.toBeInTheDocument();
  });

  it('o fluxo mantém as barras mesmo sem grupos e não tem seta', () => {
    render(
      <MFChartCard
        {...baseProps}
        kind="flow"
        groups={[]}
        flow={[{ key: '2026-10', label: 'out', receitas: 10, despesas: 5 }]}
        footerPrefix="Últimos 6 meses"
      />
    );
    expect(screen.queryByTestId('mf-chart-test-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-test-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-test')).toHaveTextContent('Últimos 6 meses');
  });
});
