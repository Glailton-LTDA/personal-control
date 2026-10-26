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

const tripsQuery = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: (...args) => tripsQuery(...args),
    })),
  },
}));

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
    tripsQuery.mockResolvedValue({ data: TRIPS, error: null });
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
});
