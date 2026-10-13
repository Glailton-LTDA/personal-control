import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFExtrato from './MFExtrato';

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

// O Extrato só cria o cliente (os dados vêm do hook mockado abaixo)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
}));

// useMFStatement mockado com delta relativo à conta filtrada (assim como o
// hook real): 'all' = neutro; origem = saída; destino = entrada.
const statementMock = vi.fn();
const categoriesMock = vi.fn();
vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMFStatement: (...args) => statementMock(...args),
    useMFCategories: (...args) => categoriesMock(...args),
    useUpdateMFTransaction: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
  };
});

const transferTx = {
  id: 'tx-t',
  type: 'TRANSFERENCIA',
  description: 'Para o Itaú',
  amount: 100,
  payment_date: '2026-10-10',
  status: 'PAGO',
  account_id: 'acc-1',
  transfer_account_id: 'acc-2',
};

const incomeTx = {
  id: 'tx-r',
  type: 'RECEITA',
  description: 'Salário',
  amount: 500,
  payment_date: '2026-10-05',
  status: 'PAGO',
  account_id: 'acc-1',
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFExtrato user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    </QueryClientProvider>
  );
};

/** Delta relativo à conta filtrada (mesma semântica do hook real). */
const deltaFor = (tx, accountId) => {
  if (tx.type === 'TRANSFERENCIA') {
    if (accountId === 'acc-1') return tx.transfer_account_id === 'acc-1' ? 100 : -100;
    if (accountId === 'acc-2') return tx.transfer_account_id === 'acc-2' ? 100 : -100;
    return -100; // sem escopo: sinal não importa (a cor fica neutra)
  }
  if (accountId && accountId !== tx.account_id) return 0;
  return 500;
};

describe('MFExtrato — pintura de transferência', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoriesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    statementMock.mockImplementation((user, monthKey, accountId) => ({
      isLoading: false,
      isError: false,
      data: {
        mixed: false,
        accounts: [
          { id: 'acc-1', name: 'Nubank', currency: 'BRL' },
          { id: 'acc-2', name: 'Itaú', currency: 'BRL' },
        ],
        groups: [
          {
            date: '2026-10-10',
            items: [
              {
                tx: transferTx,
                delta: deltaFor(transferTx, accountId),
                accountName: 'Nubank',
                transferAccountName: 'Itaú',
                balance: 0,
                currency: 'BRL',
              },
              {
                tx: incomeTx,
                delta: deltaFor(incomeTx, accountId),
                accountName: 'Nubank',
                balance: 500,
                currency: 'BRL',
              },
            ],
          },
        ],
      },
    }));
  });

  it('sem filtro de conta a transferência é neutra (⇄) e a receita verde', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-statement-amount')).toHaveLength(2);
    });

    const [transferAmount, incomeAmount] = screen.getAllByTestId('mf-statement-amount');
    expect(transferAmount.textContent).toContain('⇄');
    // Neutra: não usa a cor de saída/entrada
    expect(transferAmount.style.color).not.toBe('#ef4444');
    expect(transferAmount.style.color).not.toBe('#10b981');

    expect(incomeAmount.textContent).toContain('+');
    expect(incomeAmount.style.color).toBe('#10b981');
  });

  it('filtrando a conta de origem a transferência fica vermelha (−)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-statement-filter')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-statement-filter'));
    fireEvent.click(screen.getByTestId('mf-statement-filter-option-acc-1'));

    await waitFor(() => {
      expect(statementMock).toHaveBeenLastCalledWith(mockUser, '2026-10', 'acc-1', 'all');
    });

    const [transferAmount] = screen.getAllByTestId('mf-statement-amount');
    expect(transferAmount.textContent).toContain('−');
    expect(transferAmount.style.color).toBe('#ef4444');
  });

  it('filtrando a conta de destino a transferência fica verde (+)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-statement-filter')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-statement-filter'));
    fireEvent.click(screen.getByTestId('mf-statement-filter-option-acc-2'));

    await waitFor(() => {
      expect(statementMock).toHaveBeenLastCalledWith(mockUser, '2026-10', 'acc-2', 'all');
    });

    const [transferAmount] = screen.getAllByTestId('mf-statement-amount');
    expect(transferAmount.textContent).toContain('+');
    expect(transferAmount.style.color).toBe('#10b981');
  });
});

describe('MFExtrato — avatar da categoria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoriesMock.mockReturnValue({
      data: [{ id: 'cat-1', name: 'Mercado', icon: '🛒', color: '#f59e0b' }],
      isLoading: false,
      isError: false,
    });
    statementMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        mixed: false,
        accounts: [{ id: 'acc-1', name: 'Nubank', currency: 'BRL' }],
        groups: [
          {
            date: '2026-10-05',
            items: [
              {
                tx: { ...incomeTx, id: 'tx-cat', category_id: 'cat-1' },
                delta: 500,
                accountName: 'Nubank',
                balance: 500,
                currency: 'BRL',
              },
              {
                tx: transferTx,
                delta: -100,
                accountName: 'Nubank',
                transferAccountName: 'Itaú',
                balance: 400,
                currency: 'BRL',
              },
            ],
          },
        ],
      },
    });
  });

  it('mostra o ícone da categoria; transferência sem categoria mantém o ícone de tipo', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-statement-item')).toHaveLength(2);
    });

    // lançamento com categoria → bolha com o ícone dela
    expect(screen.getByTestId('mf-statement-avatar')).toHaveTextContent('🛒');
    // transferência sem categoria → sem avatar (ícone de tipo)
    expect(screen.getAllByTestId('mf-statement-avatar')).toHaveLength(1);
  });

  it('clique na linha abre os Detalhes (qualquer transação)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-statement-item')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByTestId('mf-statement-item')[1]);
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail')).toBeInTheDocument();
    });
    // transferência mostra o título e o de→para
    expect(screen.getByTestId('mf-tx-detail-title')).toHaveTextContent(
      'minhasfinancas.tx_detail_transfer'
    );
  });
});
