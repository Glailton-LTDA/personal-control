import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFResumo from './MFResumo';
import MFContas from './MFContas';

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

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock Supabase: uma conta em BRL e outra em USD (sem cotação: valores nativos)
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
      { id: 'acc-brl', name: 'Conta BRL', account_type: 'CORRENTE', currency: 'BRL', initial_balance: 1000, color: '#6366f1', sort_order: 0 },
      { id: 'acc-usd', name: 'Conta USD', account_type: 'CORRENTE', currency: 'USD', initial_balance: 200, color: '#10b981', sort_order: 1 },
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

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const renderWithProviders = (ui) => {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

// O Intl usa espaço não separável (U+00A0) em algumas moedas; normaliza para asserções.
const rawText = (element) => element.textContent.replace(/\u00A0/g, ' ');

describe('Multi-moeda (sem cotação)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Resumo: totais separados por moeda (nunca soma R$ com US$)', async () => {
    renderWithProviders(
      <MFResumo user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    });

    const kpi = screen.getByTestId('mf-kpi-value-kpi_balance');
    expect(rawText(kpi)).toContain('R$ 1.000,00');
    expect(rawText(kpi)).toContain('US$ 200,00');
    // empilhado (uma moeda por linha), não somado nem lado a lado
    expect(kpi.querySelectorAll('span span').length).toBeGreaterThanOrEqual(2);
  });

  it('Resumo: abas de moeda filtram as contas por tela', async () => {
    renderWithProviders(
      <MFResumo user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-resumo-currency-tabs-USD'));

    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(1);
    expect(screen.getByText('Conta USD')).toBeInTheDocument();
    expect(screen.queryByText('Conta BRL')).not.toBeInTheDocument();

    const kpi = screen.getByTestId('mf-kpi-value-kpi_balance');
    expect(rawText(kpi)).toContain('US$ 200,00');
    expect(rawText(kpi)).not.toContain('R$');
  });

  it('Contas: abas de moeda filtram tabela e KPI para uma moeda', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-contas-currency-tabs-USD'));

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
    });
    // KPI passa a mostrar só a moeda da aba (sem concatenar)
    expect(screen.getByTestId('mf-contas-currency-tabs-USD')).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('Contas: valores na moeda nativa + totais agrupados por moeda', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // Badge da moeda na linha (a aba USD também mostra o código)
    expect(screen.getAllByText('USD').length).toBeGreaterThanOrEqual(2);

    // Linha USD exibida em dólar nativo (saldo inicial e saldo)
    expect(screen.getAllByText('US$ 200,00').length).toBeGreaterThanOrEqual(2);

    // KPI de saldo empilhado (uma moeda por linha, sem "·" lateral)
    const kpiValue = screen.getByTestId('mf-contas-kpi-balance-value');
    expect(kpiValue).toHaveTextContent('R$ 1.000,00');
    expect(kpiValue).toHaveTextContent('US$ 200,00');
    expect(kpiValue.textContent).not.toContain('·');
    expect(kpiValue.querySelectorAll('[data-testid$="-line-BRL"]').length).toBe(1);

    // Totais do rodapé empilhados por moeda (sem "·" lateral que estourava)
    const foot = screen.getByTestId('mf-contas-foot-saldo');
    expect(foot).toHaveTextContent('R$ 1.000,00');
    expect(foot).toHaveTextContent('US$ 200,00');
    expect(foot.textContent).not.toContain('·');
  });

  it('Transferência: destino só aceita contas da mesma moeda', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-new-transfer'));

    expect(screen.getByTestId('mf-transfer-modal')).toBeInTheDocument();
    // Origem = Conta BRL; a única outra conta é USD → sem destino + aviso
    fireEvent.click(screen.getByTestId('mf-transfer-to'));
    expect(screen.getByTestId('mf-transfer-to-popover')).toBeInTheDocument();
    expect(screen.getByTestId('mf-transfer-to-none')).toBeInTheDocument();
    expect(screen.getByTestId('mf-transfer-same-currency')).toBeInTheDocument();
  });
});
