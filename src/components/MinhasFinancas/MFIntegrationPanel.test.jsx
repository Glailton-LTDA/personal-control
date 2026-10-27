import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFIntegrationPanel from './MFIntegrationPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

const TRIPS = [
  {
    id: 'trip-1',
    title: 'Gramado',
    start_date: '2026-05-01',
    end_date: '2026-05-10',
    currencies: ['BRL'],
  },
  {
    id: 'trip-2',
    title: 'Lisboa',
    start_date: '2026-06-01',
    end_date: '2026-06-15',
    currencies: ['EUR'],
  },
];

const INVESTMENTS = [
  {
    id: 'inv-1',
    name: 'CDB C6',
    currency: 'BRL',
    institution: { name: 'C6 Bank' },
  },
  {
    id: 'inv-2',
    name: 'LCA Nubank',
    currency: 'BRL',
    institution: { name: 'Nubank' },
  },
  {
    id: 'inv-usd',
    name: 'Wise',
    currency: 'USD',
    institution: { name: 'Wise' },
  },
];

const tripsQuery = vi.fn();
const investmentsQuery = vi.fn();
vi.mock('../../lib/supabase', () => {
  const chain = (run) => {
    const query = {
      select: vi.fn(() => query),
      order: (...args) => run(...args),
    };
    return query;
  };
  return {
    supabase: {
      from: vi.fn((table) =>
        table === 'investment_accounts'
          ? chain(investmentsQuery)
          : chain(tripsQuery)
      ),
    },
  };
});

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderPanel = (overrides = {}) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MFIntegrationPanel
        user={{ id: 'user-1' }}
        account={{ id: 'acc-1', account_type: 'CORRENTE', currency: 'BRL' }}
        type="DESPESA"
        amount={100}
        mirrorAmount={100}
        installmentCount={1}
        paymentDate="2026-05-02"
        value={{ tripEnabled: false, tripId: '' }}
        onChange={() => {}}
        {...overrides}
      />
    </QueryClientProvider>
  );
};

/** Painel controlado: mantém o value em estado, como na tela de lançamento. */
const renderStatefulPanel = (overrides = {}) => {
  const queryClient = createTestQueryClient();
  const Stateful = () => {
    const [value, setValue] = React.useState({ tripEnabled: false, tripId: '' });
    return (
      <MFIntegrationPanel
        user={{ id: 'user-1' }}
        account={{ id: 'acc-1', account_type: 'CORRENTE', currency: 'BRL' }}
        type="DESPESA"
        amount={100}
        mirrorAmount={100}
        installmentCount={1}
        paymentDate="2026-05-02"
        value={value}
        onChange={setValue}
        {...overrides}
      />
    );
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <Stateful />
    </QueryClientProvider>
  );
};

describe('MFIntegrationPanel — gasto na viagem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    tripsQuery.mockResolvedValue({ data: TRIPS, error: null });
    investmentsQuery.mockResolvedValue({ data: INVESTMENTS, error: null });
  });

  it('desabilitado para lançamento pendente', () => {
    renderPanel({ disabledReason: 'pending' });
    expect(screen.getByTestId('mf-integration-trip-toggle')).toBeDisabled();
    expect(screen.getByTestId('mf-integration-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_pending'
    );
  });

  it('desabilitado para recorrente e estorno', () => {
    const { unmount } = renderPanel({ disabledReason: 'recurring' });
    expect(screen.getByTestId('mf-integration-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_recurring'
    );
    unmount();

    renderPanel({ disabledReason: 'estorno' });
    expect(screen.getByTestId('mf-integration-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_estorno'
    );
  });

  it('offline com vínculo explica que precisa de conexão', () => {
    renderPanel({
      disabledReason: 'offline_linked',
      offline: true,
      linked: true,
      value: { tripEnabled: true, tripId: 'trip-1' },
    });
    expect(screen.getByTestId('mf-integration-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_offline_linked'
    );
  });

  it('ligar o checkbox carrega as viagens e escolher preenche o tripId', async () => {
    renderStatefulPanel();

    fireEvent.click(screen.getByTestId('mf-integration-trip-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-select')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select'));
    await waitFor(() => {
      expect(
        screen.getByTestId('mf-integration-trip-select-option-trip-2')
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select-option-trip-2'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-select')).toHaveTextContent('Lisboa');
    });
  });

  it('prévia mostra a viagem/data e o total do parcelado', async () => {
    renderPanel({
      value: { tripEnabled: true, tripId: 'trip-1' },
      amount: 100,
      mirrorAmount: 300,
      installmentCount: 3,
    });

    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-preview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-integration-preview')).toHaveTextContent(
      'minhasfinancas.integration_trip_preview'
    );
    expect(screen.getByTestId('mf-integration-preview')).toHaveTextContent(
      'minhasfinancas.integration_trip_installments'
    );
  });

  it('avisa quando a data está fora do período da viagem', async () => {
    renderPanel({
      value: { tripEnabled: true, tripId: 'trip-1' },
      paymentDate: '2026-09-01',
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-warning')).toBeInTheDocument();
    });
  });

  it('avisa quando a viagem não tem a moeda da conta (sem conversão)', async () => {
    const onChange = vi.fn();
    renderPanel({
      value: { tripEnabled: true, tripId: 'trip-2' },
      account: { id: 'acc-1', account_type: 'CORRENTE', currency: 'BRL' },
      onChange,
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-currency')).toBeInTheDocument();
    });
    expect(tripsQuery).toHaveBeenCalled();
  });

  it('desmarcar limpa a viagem escolhida', async () => {
    const onChange = vi.fn();
    renderPanel({ value: { tripEnabled: true, tripId: 'trip-1' }, onChange });
    fireEvent.click(screen.getByTestId('mf-integration-trip-toggle'));
    expect(onChange).toHaveBeenLastCalledWith({ tripEnabled: false, tripId: '' });
  });

  it('carrega só investimentos da moeda da conta e escolher preenche o id', async () => {
    renderStatefulPanel();

    fireEvent.click(screen.getByTestId('mf-integration-investment-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-investment-select')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-integration-investment-select'));
    await waitFor(() => {
      expect(
        screen.getByTestId('mf-integration-investment-select-option-inv-1')
      ).toBeInTheDocument();
    });
    // Conta USD não aparece para uma conta do MF em BRL (sem conversão).
    expect(
      screen.queryByTestId('mf-integration-investment-select-option-inv-usd')
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId('mf-integration-investment-select-option-inv-1')
    );
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-investment-select')).toHaveTextContent(
        'CDB C6'
      );
    });
  });

  it('prévia do rendimento aparece com a conta e o mês', async () => {
    renderPanel({
      value: { investmentEnabled: true, investmentAccountId: 'inv-1' },
      type: 'DESPESA',
      mirrorAmount: 100,
      paymentDate: '2026-05-02',
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('mf-integration-investment-preview')
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-integration-investment-preview')).toHaveTextContent(
      'minhasfinancas.integration_investment_preview'
    );
  });

  it('sem conta de investimento na moeda mostra aviso', async () => {
    renderPanel({
      account: { id: 'acc-eur', account_type: 'CORRENTE', currency: 'EUR' },
      value: { investmentEnabled: true, investmentAccountId: '' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-investment-empty')).toBeInTheDocument();
    });
  });

  it('cartão desabilita o investimento (viagem continua permitida)', () => {
    renderPanel({
      account: { id: 'acc-card', account_type: 'CARTAO', currency: 'BRL' },
      investmentDisabledReason: 'card',
      tripDisabledReason: null,
    });

    expect(screen.getByTestId('mf-integration-investment-toggle')).toBeDisabled();
    expect(screen.getByTestId('mf-integration-investment-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_card'
    );
    expect(screen.getByTestId('mf-integration-trip-toggle')).not.toBeDisabled();
    expect(screen.queryByTestId('mf-integration-disabled')).not.toBeInTheDocument();
  });

  it('desmarcar o investimento limpa a conta escolhida', () => {
    const onChange = vi.fn();
    renderPanel({
      value: { investmentEnabled: true, investmentAccountId: 'inv-1' },
      onChange,
    });
    fireEvent.click(screen.getByTestId('mf-integration-investment-toggle'));
    expect(onChange).toHaveBeenLastCalledWith({
      investmentEnabled: false,
      investmentAccountId: '',
    });
  });
});
