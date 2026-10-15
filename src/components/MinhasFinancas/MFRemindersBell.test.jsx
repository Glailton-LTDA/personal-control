import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFRemindersBell from './MFRemindersBell';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// Mock Supabase (push toggle não é exercitado aqui — sem PushManager no jsdom)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

// Hooks com dados fixos (conta + 1 despesa vencendo em 3 dias)
vi.mock('../../hooks/useMinhasFinancas', () => ({
  useMFAccounts: () => ({
    data: [{ id: 'acc-1', name: 'Nuconta', account_type: 'CORRENTE', currency: 'BRL' }],
  }),
  useMFAllTransactions: () => ({
    data: [
      {
        id: 'tx-rem',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aluguel',
        amount: 1500,
        status: 'PENDENTE',
        payment_date: '2026-10-18',
        due_date: null,
      },
    ],
    isLoading: false,
  }),
  formatMoney: (value) => `R$ ${value}`,
  mfInstallmentSuffix: () => '',
  toISODate: (date) => date.toISOString().slice(0, 10),
}));

vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12, 0, 0) });

const renderBell = (onChangeMonth = vi.fn()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MFRemindersBell user={{ id: 'test-user' }} onChangeMonth={onChangeMonth} />
    </QueryClientProvider>
  );
  return onChangeMonth;
};

describe('MFRemindersBell — sino de lembretes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  it('mostra o contador e abre o painel com o lembrete', async () => {
    renderBell();

    await waitFor(() => {
      expect(screen.getByTestId('mf-reminders-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByTestId('mf-reminders-bell'));
    expect(screen.getByTestId('mf-reminders-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mf-reminders-item-tx-rem')).toHaveTextContent('Aluguel');
  });

  it('clicar no lembrete vai aos Lançamentos no mês do vencimento', async () => {
    const onChangeMonth = renderBell();

    await waitFor(() => {
      expect(screen.getByTestId('mf-reminders-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-reminders-bell'));

    const listener = vi.fn();
    window.addEventListener('set-active-tab', listener);
    fireEvent.click(screen.getByTestId('mf-reminders-item-tx-rem'));
    expect(onChangeMonth).toHaveBeenCalledWith('2026-10');
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('set-active-tab', listener);
    expect(screen.queryByTestId('mf-reminders-panel')).not.toBeInTheDocument();
  });

  it('sem push no jsdom o toggle fica desabilitado', async () => {
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('mf-reminders-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-reminders-bell'));
    expect(screen.getByTestId('mf-reminders-push-toggle')).toBeDisabled();
  });
});
