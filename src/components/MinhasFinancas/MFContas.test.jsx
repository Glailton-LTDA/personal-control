import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Mock Supabase
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
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(result).then(onFulfilled, onRejected)
      ),
    };
    return chain;
  };

  const accounts = makeChain({
    data: [
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, color: '#06b6d4', sort_order: 1 },
      {
        id: 'acc-3',
        name: 'Poupança Antiga',
        account_type: 'POUPANCA',
        initial_balance: 0,
        color: '#a855f7',
        sort_order: 2,
        archived_at: '2026-09-01T12:00:00.000Z',
      },
      {
        id: 'acc-card',
        name: 'Visa',
        account_type: 'CARTAO',
        initial_balance: 0,
        color: '#6366f1',
        sort_order: 3,
        credit_limit: 1000,
        closing_day: 10,
        due_day: 20,
      },
    ],
    error: null,
  });
  const transactions = makeChain({ data: [], error: null });
  const groups = makeChain({
    data: [
      { id: 'grp-1', name: 'Nubank', icon: '🟣', parent_id: null, sort_order: 0, show_in_summary: true },
      { id: 'grp-2', name: 'Caixinhas', icon: '🐷', parent_id: 'grp-1', sort_order: 1, show_in_summary: true },
      { id: 'grp-3', name: 'Vazio', icon: '📂', parent_id: null, sort_order: 2, show_in_summary: true },
    ],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_account_groups') return groups;
        return transactions;
      }),
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

describe('MFContas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    localStorage.removeItem('mf_month_key');
    localStorage.removeItem('mf_detail_drill');
  });

  it('renderiza a tabela de contas com totais', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    expect(screen.getByTestId('mf-contas')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // Contas na visão agrupada (padrão): nomes vivem nas LINHAS de conta
    const [firstRow, secondRow] = screen.getAllByTestId('mf-account-row');
    expect(firstRow).toHaveTextContent('Nubank');
    expect(secondRow).toHaveTextContent('Itaú');

    // Totais: R$ 150,00 (100 + 50) de saldo inicial consolidado
    expect(screen.getAllByText('R$ 150,00').length).toBeGreaterThan(0);
  });

  it('botões de ação da linha têm tooltip (title) explicando cada ação', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // Primeiro botão (documento) = Ver extrato; demais: arquivar, editar, excluir
    expect(screen.getByTestId('mf-statement-account-acc-1')).toHaveAttribute(
      'title',
      'minhasfinancas.row_open'
    );
    expect(screen.getByTestId('mf-archive-account-acc-1')).toHaveAttribute(
      'title',
      'minhasfinancas.archive'
    );
    expect(screen.getByTestId('mf-edit-account-acc-1')).toHaveAttribute(
      'title',
      'minhasfinancas.edit'
    );
    expect(screen.getByTestId('mf-delete-account-acc-1')).toHaveAttribute(
      'title',
      'minhasfinancas.delete'
    );
  });

  it('cabeçalho de grupo tem botão de editar que abre o modal em modo edição', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-group-edit-grp-1'));

    const modal = await screen.findByTestId('mf-group-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_edit_title'
    );
    expect(screen.getByTestId('mf-group-name')).toHaveValue('Nubank');
  });

  it('"Ignorar nos totais": grupo soma a ignorada, KPI e rodapé seguem a regra', async () => {
    // acc-1 (Nubank, do grupo grp-1) marcada como ignorada só neste teste
    const { supabase } = await import('../../lib/supabase');
    const realFrom = supabase.from.getMockImplementation();
    const chainFor = (result) => {
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return chain;
    };
    const accountsWithIgnored = [
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1', ignore_in_totals: true },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, color: '#06b6d4', sort_order: 1 },
      { id: 'acc-3', name: 'Poupança Antiga', account_type: 'POUPANCA', initial_balance: 0, color: '#a855f7', sort_order: 2, archived_at: '2026-09-01T12:00:00.000Z' },
      { id: 'acc-card', name: 'Visa', account_type: 'CARTAO', initial_balance: 0, color: '#6366f1', sort_order: 3, credit_limit: 1000, closing_day: 10, due_day: 20 },
    ];
    supabase.from.mockImplementation((table) =>
      table === 'mf_accounts'
        ? chainFor({ data: accountsWithIgnored, error: null })
        : realFrom(table)
    );
    try {
      renderWithProviders(
        <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
      });

      // Grupo SOMA a ignorada (saldo inicial 100 da acc-1, sem lançamentos)
      expect(screen.getByTestId('mf-group-total-grp-1')).toHaveTextContent('R$ 100,00');
      // KPI da tela EXCLUI a ignorada (só a acc-2: 50)
      expect(screen.getByTestId('mf-contas-kpi-balance')).toHaveTextContent('R$ 50,00');
      // Rodapé segue a tabela (soma tudo que está listado: 100 + 50 = 150,
      // valor que só existe no rodapé — nem no KPI nem no grupo)
      expect(screen.getByTestId('mf-contas')).toHaveTextContent('R$ 150,00');
    } finally {
      supabase.from.mockImplementation(realFrom);
    }
  });

  it('modo reordenar mostra ↑/↓ e troca o sort_order com o vizinho', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // modo off: sem botões de mover
    expect(screen.queryByTestId('mf-move-down-acc-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-reorder-toggle'));
    // acc-1 (Nubank) é o primeiro: ↑ desabilitado, ↓ habilitado
    expect(screen.getByTestId('mf-move-up-acc-1')).toBeDisabled();
    expect(screen.getByTestId('mf-move-down-acc-1')).toBeEnabled();
    // acc-2 (Itaú) é o último: ↓ desabilitado
    expect(screen.getByTestId('mf-move-down-acc-2')).toBeDisabled();

    fireEvent.click(screen.getByTestId('mf-move-down-acc-1'));
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledTimes(2);
    });
    // troca de posições: acc-1 vai p/ 1, acc-2 sobe p/ 0 (id vai no eq)
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 1 });
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(chain.eq).toHaveBeenCalledWith('id', 'acc-1');
    expect(chain.eq).toHaveBeenCalledWith('id', 'acc-2');
  });

  it('modo reordenar move o grupo entre irmãos reescrevendo o sort_order', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // fora do modo: sem botões de mover grupo
    expect(screen.queryByTestId('mf-group-move-down-grp-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-reorder-toggle'));
    // grp-1 é o primeiro entre as raízes (grp-1, grp-3): ↑ off, ↓ on
    expect(screen.getByTestId('mf-group-move-up-grp-1')).toBeDisabled();
    expect(screen.getByTestId('mf-group-move-down-grp-1')).toBeEnabled();

    fireEvent.click(screen.getByTestId('mf-group-move-down-grp-1'));
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_account_groups');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledTimes(2);
    });
    // posições reescritas nos irmãos: grp-3 → 0, grp-1 → 1
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 1 });
    expect(chain.eq).toHaveBeenCalledWith('id', 'grp-3');
    expect(chain.eq).toHaveBeenCalledWith('id', 'grp-1');
  });

  it('abre o modal e cria uma nova conta', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    fireEvent.click(screen.getByTestId('mf-new-account'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-account-currency')).toHaveTextContent('BRL');
    expect(screen.getByTestId('mf-account-currency')).toHaveTextContent('🇧🇷');
    // Cartão não é opção na criação comum: ele nasce na aba Cartões
    expect(
      screen.getByTestId('mf-account-type').querySelector('option[value="CARTAO"]')
    ).toBeNull();

    fireEvent.change(screen.getByTestId('mf-account-name'), {
      target: { value: 'Carteira' },
    });
    fireEvent.click(screen.getByText('minhasfinancas.save'));

    const { supabase } = await import('../../lib/supabase');
    const accountsChain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(accountsChain.insert).toHaveBeenCalled();
    });

    const payload = accountsChain.insert.mock.calls[0][0];
    expect(payload.name).toBe('Carteira');
    expect(payload.user_id).toBe('test-user');
    expect(payload.currency).toBe('BRL');
  });

  it('exclui uma conta quando confirmado', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-delete-account-acc-1'));

    const { supabase } = await import('../../lib/supabase');
    const accountsChain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(accountsChain.delete).toHaveBeenCalled();
    });
    expect(accountsChain.eq).toHaveBeenCalledWith('id', 'acc-1');
  });

  it('abre o detalhe da conta ao clicar na linha e volta pelo botao', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByTestId('mf-account-row')[0]);

    expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-empty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
  });

  it('drill sobrevive ao F5: restaura, ignora id inválido e limpa ao fechar', async () => {
    // restaura a conta salva
    localStorage.setItem('mf_detail_drill', JSON.stringify({ tab: 'accounts', id: 'acc-1' }));
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    });

    // fechar limpa o salvo
    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    expect(localStorage.getItem('mf_detail_drill')).toBeNull();
  });

  it('drill com id inexistente abre a lista normalmente', async () => {
    localStorage.setItem('mf_detail_drill', JSON.stringify({ tab: 'accounts', id: 'nope' }));
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
  });

  it('abre o modal de edicao sem entrar no detalhe', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-edit-account-acc-1'));

    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
  });

  it('exibe o ícone da conta e salva o ícone escolhido na edição', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    // Sem ícone gravado: fallback = inicial com a cor da conta
    expect(screen.getByTestId('mf-account-icon-acc-1')).toHaveTextContent('N');

    fireEvent.click(screen.getByTestId('mf-edit-account-acc-1'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();

    // seletor de ícone é um painel recolhível com busca
    fireEvent.click(screen.getByTestId('mf-icon-toggle'));
    fireEvent.click(screen.getByTestId('mf-icon-brand-nubank'));
    fireEvent.click(screen.getByTestId('mf-account-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0]).toMatchObject({ icon: 'brand:nubank' });
  });

  it('painel do ícone busca marcas e o color picker aceita cor fora dos presets', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-edit-account-acc-1'));
    // painel começa fechado
    expect(screen.queryByTestId('mf-icon-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-icon-toggle'));
    expect(screen.getByTestId('mf-icon-panel')).toBeInTheDocument();

    // busca por nome encontra a marca
    fireEvent.change(screen.getByTestId('mf-icon-search'), { target: { value: 'sicoob' } });
    expect(screen.getByTestId('mf-icon-brand-sicoob')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-icon-brand-nubank')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-icon-brand-sicoob'));

    // busca sem acento/caixa encontra o Tesouro Direto
    fireEvent.change(screen.getByTestId('mf-icon-search'), { target: { value: 'tesouro' } });
    expect(screen.getByTestId('mf-icon-brand-tesourodireto')).toBeInTheDocument();

    // busca sem resultado mostra o estado vazio
    fireEvent.change(screen.getByTestId('mf-icon-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('mf-icon-empty')).toBeInTheDocument();

    // cor personalizada fora dos 8 presets
    fireEvent.change(screen.getByTestId('mf-account-color-picker'), {
      target: { value: '#123456' },
    });
    fireEvent.click(screen.getByTestId('mf-account-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0]).toMatchObject({
      icon: 'brand:sicoob',
      color: '#123456',
    });
  });

  it('esconde contas arquivadas e alterna a lista de arquivadas', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    expect(screen.queryByText('Poupança Antiga')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-show-archived'));
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(3);
    });
    expect(screen.getByText('Poupança Antiga')).toBeInTheDocument();
    expect(screen.getByTestId('mf-account-archived-badge')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-show-archived'));
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
  });

  it('arquiva e restaura conta via mutação', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-archive-account-acc-1'));

    const { supabase } = await import('../../lib/supabase');
    const accountsChain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(accountsChain.update).toHaveBeenCalled();
    });
    expect(accountsChain.update.mock.calls[0][0]).toHaveProperty('archived_at');
    expect(accountsChain.eq).toHaveBeenCalledWith('id', 'acc-1');

    // Restauração da conta arquivada (lista de arquivadas visível)
    fireEvent.click(screen.getByTestId('mf-show-archived'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-archive-account-acc-3')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-archive-account-acc-3'));
    await waitFor(() => {
      expect(accountsChain.update.mock.calls[1][0].archived_at).toBeNull();
    });
    expect(accountsChain.eq).toHaveBeenCalledWith('id', 'acc-3');
  });

  it('abre o modal de novo grupo pelo botão do cabeçalho', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-new-group'));
    expect(screen.getByTestId('mf-group-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_new_title'
    );
  });

  it('não lista cartões na tela Contas (cartões vivem na aba Cartões)', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    expect(screen.queryByText('Visa')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-open-account-acc-card')).not.toBeInTheDocument();

    // Mesmo exibindo as arquivadas, o cartão continua fora da lista
    fireEvent.click(screen.getByTestId('mf-show-archived'));
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(3);
    });
    expect(screen.queryByText('Visa')).not.toBeInTheDocument();
  });

  it('visão agrupada é o padrão: cabeçalhos, ordem, sanfona e volta à lista plana', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    // Padrão: agrupadas LIGADAS, sem nenhum clique (só aparece com grupo)
    const toggle = await screen.findByTestId('mf-group-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const body = screen.getByTestId('mf-accounts-body');
    const trs = [...body.querySelectorAll('tr')];
    const indexOfTestid = (testid) =>
      trs.findIndex((tr) => tr.getAttribute('data-testid') === testid);
    const indexOfAccount = (accId) =>
      trs.findIndex((tr) => tr.querySelector(`[data-testid="mf-open-account-${accId}"]`));

    // Nubank (membro do grp-1) vem depois do cabeçalho do grupo e antes de "Sem grupo";
    // Itaú (sem grupo) fecha a lista depois do cabeçalho "Sem grupo"
    expect(indexOfTestid('mf-group-header-grp-1')).toBeGreaterThanOrEqual(0);
    expect(indexOfTestid('mf-group-header-grp-1')).toBeLessThan(indexOfAccount('acc-1'));
    expect(indexOfAccount('acc-1')).toBeLessThan(indexOfTestid('mf-ungrouped-header'));
    expect(indexOfTestid('mf-ungrouped-header')).toBeLessThan(indexOfAccount('acc-2'));

    // Grupos sem nenhuma conta visível não poluem a lista
    expect(screen.queryByTestId('mf-group-header-grp-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-header-grp-3')).not.toBeInTheDocument();

    // Contagem e total das contas diretas no cabeçalho
    expect(screen.getByTestId('mf-group-count-grp-1')).toHaveTextContent(
      'minhasfinancas.group_count'
    );
    expect(screen.getByTestId('mf-group-total-grp-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-ungrouped-count')).toBeInTheDocument();

    // Sanfona: recolher o grupo esconde as contas sob ele (cabeçalho fica)
    const foldGroup = screen.getByTestId('mf-group-fold-grp-1');
    expect(foldGroup).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(foldGroup);
    expect(foldGroup).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('mf-group-header-grp-1')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-open-account-acc-1')).not.toBeInTheDocument();

    // Recolher "Sem grupo" esconde a conta não agrupada
    const foldUngrouped = screen.getByTestId('mf-ungrouped-fold');
    fireEvent.click(foldUngrouped);
    expect(screen.getByTestId('mf-ungrouped-header')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-open-account-acc-2')).not.toBeInTheDocument();

    // Expandir tudo de volta
    fireEvent.click(foldGroup);
    fireEvent.click(foldUngrouped);
    expect(screen.getByTestId('mf-open-account-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-open-account-acc-2')).toBeInTheDocument();

    // Desliga: volta à visão plana
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('mf-group-header-grp-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-ungrouped-header')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
  });

  it('alternar "Ignorar nos totais" no modal salva na conta', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-edit-account-acc-1'));
    const ignoreBox = screen.getByTestId('mf-account-ignore-totals');
    expect(ignoreBox).not.toBeChecked();
    fireEvent.click(ignoreBox);
    expect(ignoreBox).toBeChecked();
    fireEvent.click(screen.getByTestId('mf-account-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0]).toMatchObject({
      ignore_in_totals: true,
    });
  });

  it('exibe cards de KPI com saldo consolidado, movimento do mês e previsão', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // Saldo consolidado das duas contas ativas (100 + 50) + contagem
    const balance = screen.getByTestId('mf-contas-kpi-balance');
    expect(balance).toHaveTextContent('R$ 150,00');
    expect(balance).toHaveTextContent('minhasfinancas.kpi_active_accounts');
    expect(balance).toHaveTextContent('minhasfinancas.groups_count');

    // Movimento do mês (sem lançamentos no mock: receitas e despesas zeradas)
    const movement = screen.getByTestId('mf-contas-kpi-movement');
    expect(movement).toHaveTextContent('minhasfinancas.kpi_movement');
    expect(movement).toHaveTextContent('R$ 0,00');

    // Previsão de fechamento = saldo sem lançamentos futuros
    const forecast = screen.getByTestId('mf-contas-kpi-forecast');
    expect(forecast).toHaveTextContent('R$ 150,00');
    expect(forecast).toHaveTextContent('minhasfinancas.kpi_projected');
  });

  it('coluna de transferências é líquida e o pedido do FAB abre nova conta', async () => {
    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });

    // Cabeçalho com a coluna única "Transferências" (sem crédito/débito)
    expect(screen.getByText('minhasfinancas.accounts_table_transf')).toBeInTheDocument();
    expect(
      screen.queryByText('minhasfinancas.accounts_table_transf_in')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('minhasfinancas.accounts_table_transf_out')
    ).not.toBeInTheDocument();

    // Subtotais do grupo alinhados às colunas + chip de total
    expect(screen.getByTestId('mf-group-total-grp-1')).toHaveTextContent('R$ 100,00');

    // FAB global → evento "mf-new-account" abre o modal de nova conta
    fireEvent(window, new CustomEvent('mf-new-account'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
  });

  it('abre o modal para o pedido de nova conta do FAB e o limpa ao fechar', async () => {
    const { requestNewAccount } = await import('./mfViewState');
    requestNewAccount();

    const { unmount } = renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

    // O pedido sobrevive aos remounts: abre no mount
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();

    // Fechar o modal descarta o pedido — um remount não reabre
    fireEvent.click(screen.getByTestId('mf-account-modal'));
    expect(screen.queryByTestId('mf-account-modal')).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <MFContas user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );
    expect(screen.queryByTestId('mf-account-modal')).not.toBeInTheDocument();
  });
});
