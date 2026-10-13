import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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

// Mock Supabase: conta com tipo personalizado + cadastro de tipos
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
      {
        id: 'acc-1',
        name: 'Nubank',
        account_type: 'Corretora',
        currency: 'BRL',
        initial_balance: 100,
        color: '#6366f1',
        sort_order: 0,
      },
    ],
    error: null,
  });
  const transactions = makeChain({ data: [], error: null });
  const accountTypes = makeChain({
    data: [{ id: 'type-1', name: 'Corretora', icon: '📈' }],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_account_types') return accountTypes;
        return transactions;
      }),
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

describe('Tipos de conta configuráveis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('exibe o tipo personalizado na tabela e no modal', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
    });

    // Badge do tipo na linha da conta
    const badge = screen.getByTestId('mf-account-type-badge');
    expect(badge).toHaveTextContent('Corretora');
    expect(badge).toHaveTextContent('📈');
    expect(screen.getByText('Corretora')).toBeInTheDocument();

    // Modal: select com grupo "personalizados"
    fireEvent.click(screen.getByTestId('mf-new-account'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-account-type'));
    expect(screen.getByRole('option', { name: /Corretora/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /minhasfinancas.type_corrente/ })).toBeInTheDocument();

    // Gestão de tipos (chip com X) saiu do modal: agora vive nos Ajustes (MFConfig)
    expect(screen.queryByTestId('mf-type-chip-type-1')).not.toBeInTheDocument();
  });

  it('cria um novo tipo e usa na conta', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    fireEvent.click(screen.getByTestId('mf-new-account'));
    fireEvent.click(screen.getByTestId('mf-new-type-toggle'));
    expect(screen.getByTestId('mf-new-type-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-new-type-name'), {
      target: { value: 'Cripto' },
    });
    fireEvent.click(screen.getByTestId('mf-new-type-save'));

    const { supabase } = await import('../../lib/supabase');
    const typesChain = supabase.from('mf_account_types');
    await waitFor(() => {
      expect(typesChain.insert).toHaveBeenCalled();
    });
    expect(typesChain.insert.mock.calls[0][0]).toEqual({
      user_id: 'test-user',
      name: 'Cripto',
      icon: '💳',
    });

    // O novo tipo já fica selecionado no formulário da conta
    await waitFor(() => {
      expect(screen.getByTestId('mf-account-type')).toHaveTextContent('Cripto');
    });

    // Salvar a conta usa o tipo personalizado
    fireEvent.change(screen.getByTestId('mf-account-name'), {
      target: { value: 'Carteira' },
    });
    fireEvent.click(screen.getByTestId('mf-account-save'));

    const accountsChain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(accountsChain.insert).toHaveBeenCalled();
    });
    const payload = accountsChain.insert.mock.calls[0][0];
    expect(payload.name).toBe('Carteira');
    expect(payload.account_type).toBe('Cripto');
  });

  it('ícone do tipo novo: grade de emojis abre, escolhe e grava', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    fireEvent.click(screen.getByTestId('mf-new-account'));
    fireEvent.click(screen.getByTestId('mf-new-type-toggle'));

    // Botão mostra o ícone padrão (💳) e a grade começa fechada
    expect(screen.getByTestId('mf-new-type-icon')).toHaveTextContent('💳');
    expect(screen.queryByTestId('mf-new-type-icon-picker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-new-type-icon'));
    expect(screen.getByTestId('mf-new-type-icon-picker')).toBeInTheDocument();

    // 1ª opção = 🏦 (ícone do tipo padrão CORRENTE); escolher fecha a grade
    expect(screen.getByTestId('mf-new-type-icon-opt-0')).toHaveTextContent('🏦');
    fireEvent.click(screen.getByTestId('mf-new-type-icon-opt-0'));
    expect(screen.queryByTestId('mf-new-type-icon-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-new-type-icon')).toHaveTextContent('🏦');

    fireEvent.change(screen.getByTestId('mf-new-type-name'), {
      target: { value: 'Cripto' },
    });
    fireEvent.click(screen.getByTestId('mf-new-type-save'));

    const { supabase } = await import('../../lib/supabase');
    const typesChain = supabase.from('mf_account_types');
    await waitFor(() => {
      expect(typesChain.insert).toHaveBeenCalled();
    });
    expect(typesChain.insert.mock.calls[0][0]).toEqual({
      user_id: 'test-user',
      name: 'Cripto',
      icon: '🏦',
    });
  });

  it('valida nome reservado (padrão) e nome duplicado', async () => {
    renderWithProviders(<MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />);

    fireEvent.click(screen.getByTestId('mf-new-account'));
    // Aguarda o cadastro de tipos carregar: abre o select e espera a opção
    // personalizada aparecer (a validação de duplicado depende dele)
    fireEvent.click(screen.getByTestId('mf-account-type'));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Corretora/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: /Corretora/ }));
    fireEvent.click(screen.getByTestId('mf-new-type-toggle'));

    fireEvent.change(screen.getByTestId('mf-new-type-name'), {
      target: { value: 'cartao' },
    });
    fireEvent.click(screen.getByTestId('mf-new-type-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.type_reserved');

    fireEvent.change(screen.getByTestId('mf-new-type-name'), {
      target: { value: 'Corretora' },
    });
    fireEvent.click(screen.getByTestId('mf-new-type-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.type_duplicate');

    // Nome vazio
    fireEvent.change(screen.getByTestId('mf-new-type-name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('mf-new-type-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.type_name_required');
  });
});
