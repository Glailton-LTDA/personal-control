import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MinhasFinancas from './MinhasFinancas';
import MFMonthNav from './MFMonthNav';
import { currentMonthKey, formatMonthNavLabel } from '../../hooks/useMinhasFinancas';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

// Mock Supabase: contas e lançamentos em cadeias separadas
vi.mock('../../lib/supabase', () => {
  const makeChain = (result) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(result).then(onFulfilled, onRejected)
      ),
    };
    return chain;
  };

  const accounts = makeChain({
    data: [
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0 },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, color: '#06b6d4', sort_order: 1 },
    ],
    error: null,
  });
  const transactions = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => (table === 'mf_accounts' ? accounts : transactions)),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderWithProviders = (ui) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

describe('MinhasFinancas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('mf_month_key');
    localStorage.removeItem('mf_detail_drill');
  });

  it('mês selecionado sobrevive ao F5', async () => {
    localStorage.setItem('mf_month_key', '2026-09');
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="resumo" />);

    await waitFor(() => {
      expect(screen.getByTestId('mf-month-label')).toHaveTextContent(
        formatMonthNavLabel('2026-09', 'pt-BR')
      );
    });
  });

  it('renderiza o Resumo com navegação de mês, KPIs e tabela de contas', async () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="resumo" />);

    expect(screen.getByTestId('mf-resumo')).toBeInTheDocument();
    expect(screen.getByTestId('mf-month-nav')).toBeInTheDocument();

    // KPIs
    expect(screen.getByText('minhasfinancas.kpi_balance')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.kpi_received')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.kpi_spent')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.kpi_forecast')).toBeInTheDocument();

    // Tabela de contas com dados reais (2 contas do mock)
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    });
    expect(screen.getByText('Nubank')).toBeInTheDocument();
    expect(screen.getByText('Itaú')).toBeInTheDocument();

    // Saldo da conta 1 = saldo inicial (sem lançamentos)
    expect(screen.getAllByText('R$ 100,00').length).toBeGreaterThan(0);
  });

  it('renderiza o Extrato com estado vazio quando não há movimentações', async () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="statement" />);

    expect(screen.getByTestId('mf-extrato')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('mf-extrato-empty')).toBeInTheDocument();
    });
  });

  it('renderiza o placeholder para abas não implementadas', () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="openfinance" />);

    expect(screen.getByTestId('mf-placeholder-openfinance')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.coming_soon')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-resumo')).not.toBeInTheDocument();
  });

  it('MFMonthNav tolera render sem monthKey/onChange (fallback: mês atual)', () => {
    renderWithProviders(<MFMonthNav />);

    const label = screen.getByTestId('mf-month-label');
    expect(label).toBeInTheDocument();
    // rótulo curto do nav: mês sem ano no ano corrente ("Outubro")
    expect(label.textContent).toBe(formatMonthNavLabel(currentMonthKey(), 'pt-BR'));

    // Navegar sem onChange não deve lançar erro
    fireEvent.click(screen.getByTestId('mf-month-prev'));
    fireEvent.click(screen.getByTestId('mf-month-next'));
    expect(screen.getByTestId('mf-month-nav')).toBeInTheDocument();
  });

  it('MFMonthNav: clique no rótulo salta para o mês vigente', () => {
    const onChange = vi.fn();
    renderWithProviders(<MFMonthNav monthKey="2024-03" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mf-month-label'));
    expect(onChange).toHaveBeenCalledWith(currentMonthKey());
  });

  it('MFMonthNav: rótulo sem ano no ano corrente; mês curto + ano fora dele', () => {
    const year = new Date().getFullYear();
    const { unmount } = renderWithProviders(<MFMonthNav monthKey={`${year}-11`} />);
    expect(screen.getByTestId('mf-month-label')).toHaveTextContent(/^Novembro$/);
    unmount();

    renderWithProviders(<MFMonthNav monthKey="2020-11" />);
    expect(screen.getByTestId('mf-month-label')).toHaveTextContent(/^Nov\.\/2020$/);
  });

  it('MFMonthNav: clique e segure abre o modal Filtrar e aplica mês/ano', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MFMonthNav monthKey="2026-10" onChange={onChange} />);
    const label = screen.getByTestId('mf-month-label');

    // pressionar > 500ms dispara o filtro (evento sintético — jsdom não tem PointerEvent)
    fireEvent(label, new Event('pointerdown', { bubbles: true }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    expect(screen.getByTestId('mf-month-filter')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-month-filter-month'));
    fireEvent.click(screen.getByTestId('mf-month-filter-month-option-3'));
    fireEvent.click(screen.getByTestId('mf-month-filter-year'));
    fireEvent.click(screen.getByTestId('mf-month-filter-year-option-2024'));
    fireEvent.click(screen.getByTestId('mf-month-filter-ok'));

    expect(onChange).toHaveBeenCalledWith('2024-03');
    expect(screen.queryByTestId('mf-month-filter')).not.toBeInTheDocument();
  });

  it('MFMonthNav: cancelar o modal Filtrar não navega', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MFMonthNav monthKey="2026-10" onChange={onChange} />);
    const label = screen.getByTestId('mf-month-label');

    fireEvent(label, new Event('pointerdown', { bubbles: true }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    fireEvent.click(screen.getByTestId('mf-month-filter-cancel'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mf-month-filter')).not.toBeInTheDocument();
  });

  it('MFMonthNav: modal Filtrar usa portal no body (glass-card recortava o fixed)', async () => {
    renderWithProviders(
      <div className="glass-card">
        <MFMonthNav monthKey="2026-10" onChange={() => {}} />
      </div>
    );
    const label = screen.getByTestId('mf-month-label');

    fireEvent(label, new Event('pointerdown', { bubbles: true }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    const modal = screen.getByTestId('mf-month-filter');
    // Portal direto no body: montado dentro do .glass-card (backdrop-filter)
    // o overlay fixed ficava recortado na altura do card e atrás do conteúdo.
    expect(modal.parentElement).toBe(document.body);
  });

  it('FAB "+" abre o menu com as 4 opções e cria pela sobreposição', async () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="transactions" />);

    const fab = screen.getByTestId('mf-fab-add');
    fireEvent.click(fab);

    expect(screen.getByTestId('mf-fab-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-expense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-cardExpense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-income')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-transfer')).toBeInTheDocument();
    // Estorno é exclusivo do detalhe do cartão
    expect(screen.queryByTestId('mf-add-opt-estorno')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-add-opt-expense'));
    expect(screen.getByTestId('mf-add-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    // FAB some enquanto a tela de criação está aberta
    expect(screen.queryByTestId('mf-fab-add')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-cancel'));
    expect(screen.queryByTestId('mf-add-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-fab-add')).toBeInTheDocument();
  });

  it('FAB "+" do menu abre o modal de transferência direto', async () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="resumo" />);

    fireEvent.click(screen.getByTestId('mf-fab-add'));
    fireEvent.click(screen.getByTestId('mf-add-opt-transfer'));

    expect(screen.getByTestId('mf-transfer-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
  });

  it('FAB esconde em detalhe de conta/cartão e em 2ª tela (eventos do módulo)', async () => {
    renderWithProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="accounts" />);
    expect(screen.getByTestId('mf-fab-add')).toBeInTheDocument();

    // Detalhe de conta/cartão aberto (MFAccountDetail dispara o contexto)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('mf-detail-context', { detail: { scope: 'contas' } })
      );
    });
    expect(screen.queryByTestId('mf-fab-add')).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('mf-detail-context', { detail: { scope: null } })
      );
    });
    expect(screen.getByTestId('mf-fab-add')).toBeInTheDocument();

    // 2ª tela de criação/edição aberta (MFTransacaoScreen)
    await act(async () => {
      window.dispatchEvent(new CustomEvent('mf-tx-screen', { detail: { open: true } }));
    });
    expect(screen.queryByTestId('mf-fab-add')).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('mf-tx-screen', { detail: { open: false } }));
    });
    expect(screen.getByTestId('mf-fab-add')).toBeInTheDocument();
  });
});
