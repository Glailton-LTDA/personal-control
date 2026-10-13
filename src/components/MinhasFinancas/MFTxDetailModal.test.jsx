import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTxDetailModal from './MFTxDetailModal';

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
      insert: vi.fn((rows) =>
        makeChain(() => ({
          data: (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
            id: `created-${index}`,
            ...row,
          })),
          error: null,
        }))
      ),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        makeChain(() => {
          const resolved = typeof result === 'function' ? result() : result;
          const rows = Array.isArray(resolved?.data) ? resolved.data : null;
          return { data: rows ? rows[0] ?? null : { id: 'tx-1' }, error: null };
        })
      ),
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(typeof result === 'function' ? result() : result).then(
          onFulfilled,
          onRejected
        )
      ),
    };
    return chain;
  };

  const accounts = makeChain({
    data: [
      { id: 'acc-1', name: 'Nuconta', account_type: 'CORRENTE', currency: 'BRL' },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', currency: 'BRL' },
      { id: 'acc-card', name: 'Nubank', account_type: 'CARTAO', currency: 'BRL', closing_day: 10, due_day: 20, linked_account_id: 'acc-1' },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [
      { id: 'cat-card', name: 'Cartões de crédito', type: 'DESPESA', parent_id: null },
      { id: 'cat-est', name: 'Estornos', type: 'DESPESA', parent_id: 'cat-card' },
    ],
    error: null,
  });
  const tagRows = [{ id: 'tag-1', name: 'Viagem', color: '#06b6d4' }];
  const tags = makeChain(() => ({ data: tagRows, error: null }));
  // insert com estado: a tag nova aparece na lista (como no refetch real)
  tags.insert = vi.fn((payload) => {
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row, index) => ({
      id: `tag-new-${index}`,
      ...row,
    }));
    tagRows.push(...rows);
    return makeChain(() => ({ data: rows, error: null }));
  });
  const transactions = makeChain(() => ({
    data: [
      { id: 'tx-1', account_id: 'acc-card', type: 'DESPESA', description: 'Teste parcelado', amount: 333.34, payment_date: '2026-10-02', due_date: null, effective_date: '2026-10-02', status: 'PAGO', category_id: 'cat-est', notes: null, recurrence: 'NONE', installments_current: 1, installments_total: 3, parent_transaction_id: null, invoice_close: '2026-10-10', created_at: '2026-10-02T10:40:00.000Z', updated_at: '2026-10-02T10:48:00.000Z' },
      { id: 'tx-2', account_id: 'acc-card', type: 'DESPESA', description: 'Teste parcelado', amount: 333.33, payment_date: '2026-11-02', status: 'PAGO', installments_current: 2, installments_total: 3, parent_transaction_id: 'tx-1', invoice_close: '2026-11-10', created_at: '2026-10-02T10:40:00.000Z' },
      { id: 'tx-3', account_id: 'acc-card', type: 'DESPESA', description: 'Teste parcelado', amount: 333.33, payment_date: '2026-12-02', status: 'PAGO', installments_current: 3, installments_total: 3, parent_transaction_id: 'tx-1', invoice_close: '2026-12-10', created_at: '2026-10-02T10:40:00.000Z' },
    ],
    error: null,
  }));
  const links = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return links;
        return transactions;
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const tx = {
  id: 'tx-1',
  account_id: 'acc-card',
  type: 'DESPESA',
  description: 'Teste parcelado',
  amount: 333.34,
  payment_date: '2026-10-02',
  due_date: null,
  effective_date: '2026-10-02',
  status: 'PAGO',
  category_id: 'cat-est',
  notes: null,
  recurrence: 'NONE',
  installments_current: 1,
  installments_total: 3,
  parent_transaction_id: null,
  invoice_close: '2026-10-10',
  created_at: '2026-10-02T10:40:00.000Z',
  updated_at: '2026-10-02T10:48:00.000Z',
};

const renderModal = (over = {}, onEditFull = vi.fn(), tagIds = []) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MFTxDetailModal
        tx={{ ...tx, ...over }}
        tagIds={tagIds}
        user={{ id: 'test-user' }}
        onClose={() => {}}
        onEditFull={onEditFull}
      />
    </QueryClientProvider>
  );
  return onEditFull;
};

describe('MFTxDetailModal — Detalhes da despesa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('exibe resumo, parcela, datas e ações', async () => {
    renderModal();
    await waitFor(
      () => {
        expect(screen.getByTestId('mf-tx-detail-invoice-status')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
    expect(screen.getByTestId('mf-tx-detail-title')).toHaveTextContent(
      'minhasfinancas.tx_detail_expense'
    );
    expect(screen.getByTestId('mf-tx-detail-desc')).toHaveTextContent('Teste parcelado');
    expect(screen.getByTestId('mf-tx-detail-card')).toHaveTextContent('Nubank');
    expect(screen.getByTestId('mf-tx-detail-account')).toHaveTextContent('Nuconta');
    expect(screen.getByTestId('mf-tx-detail-recurrence')).toHaveTextContent('1/3');
    expect(screen.getByTestId('mf-tx-detail-invoice-status')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-detail-launch')).toHaveTextContent('02/10/2026');
    expect(screen.getByTestId('mf-tx-detail-due')).toHaveTextContent('20/10/2026');
    expect(screen.getByTestId('mf-tx-detail-category')).toHaveTextContent('Cartões de crédito');
    expect(screen.getByTestId('mf-tx-detail-toggle-paid')).toBeInTheDocument();
  });

  it('menu ⋮ lista as 9 ações na parcelada de cartão (antecipar só se parcelada)', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    for (const testId of [
      'mf-tx-detail-menu-edit',
      'mf-tx-detail-menu-delete',
      'mf-tx-detail-menu-value',
      'mf-tx-detail-menu-duplicate',
      'mf-tx-detail-menu-parcels',
      'mf-tx-detail-menu-anticipate',
      'mf-tx-detail-menu-debit',
      'mf-tx-detail-menu-move',
      'mf-tx-detail-menu-estornar',
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it('avulso não oferece antecipar nem visualizar parcelas', async () => {
    renderModal({ installments_total: null, installments_current: null });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    expect(screen.queryByTestId('mf-tx-detail-menu-anticipate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-detail-menu-parcels')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-detail-menu-edit')).toBeInTheDocument();
  });

  it('edição rápida salva descrição e categoria', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-quick')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-quick'));
    fireEvent.change(screen.getByTestId('mf-tx-detail-quick-desc'), {
      target: { value: 'Teste editado' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-quick-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').update).toHaveBeenCalled();
    });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_detail_saved');
  });

  it('edição rápida cria tag nova como na tela de criação', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-quick')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-quick'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-quick-tags-toggle'));
    fireEvent.change(screen.getByTestId('mf-tx-detail-quick-new-tag'), {
      target: { value: 'NovaTag' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-quick-add-tag'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_tags').insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'NovaTag' })
      );
    });
    // a nova tag já entra selecionada
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-quick-tags')).toHaveTextContent('# NovaTag');
    });
  });

  it('toggle alterna PAGO → PENDENTE', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-toggle-paid')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-toggle-paid'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDENTE' })
      );
    });
  });

  it('mover para a próxima fatura com escopo atualiza o vínculo', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-move'));
    // escopo da série: só esta
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-scope-one')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-scope-one'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').update).toHaveBeenCalled();
    });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_detail_moved');
  });

  it('receita não tem Duplicar; transferência mostra de→para e Efetivada', async () => {
    renderModal({ id: 'tx-r', type: 'RECEITA', description: 'Salário', installments_total: null, installments_current: null, invoice_close: null });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-title')).toHaveTextContent(
        'minhasfinancas.tx_detail_income'
      );
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    expect(screen.getByTestId('mf-tx-detail-menu-edit')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-detail-menu-duplicate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-detail-menu-anticipate')).not.toBeInTheDocument();
  });

  it('transferência: de→para, efetivação e item Efetivada (sem Duplicar)', async () => {
    renderModal({
      id: 'tx-t',
      type: 'TRANSFERENCIA',
      description: 'Para o Itaú',
      account_id: 'acc-1',
      transfer_account_id: 'acc-2',
      installments_total: null,
      installments_current: null,
      invoice_close: null,
      effective_date: '2026-10-10',
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-title')).toHaveTextContent(
        'minhasfinancas.tx_detail_transfer'
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-from')).toHaveTextContent('Nuconta');
      expect(screen.getByTestId('mf-tx-detail-to')).toHaveTextContent('Itaú');
    });
    expect(screen.getByTestId('mf-tx-detail-effective')).toHaveTextContent('10/10/2026');
    expect(screen.getByTestId('mf-tx-detail-status')).toHaveTextContent(
      'minhasfinancas.tx_detail_settled'
    );
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    expect(screen.getByTestId('mf-tx-detail-menu-settled')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-detail-menu-duplicate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-detail-menu-debit')).not.toBeInTheDocument();

    // Efetivada alterna PAGO → PENDENTE
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-settled'));
    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDENTE' })
      );
    });
  });

  it('duplicar como transferência com escopo cria a transferência', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-duplicate'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-transfer'));
    // escopo da série: só esta
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-dupe-scope-one')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-scope-one'));
    // destino: conta diferente da origem (Nuconta)
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-dupe-target')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-confirm'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    const payload = supabase.from('mf_transactions').insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({
      type: 'TRANSFERENCIA',
      account_id: 'acc-1', // origem: conta vinculada do cartão
      transfer_account_id: 'acc-2',
      amount: 333.34,
    });
  });

  it('duplicar como compensação espelha a despesa em receita', async () => {
    renderModal({
      id: 'tx-av',
      description: 'Chocolate',
      amount: 50,
      account_id: 'acc-1',
      installments_total: null,
      installments_current: null,
      invoice_close: null,
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-duplicate'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-comp'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    const payload = supabase.from('mf_transactions').insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({ type: 'RECEITA', account_id: 'acc-1', amount: 50 });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_detail_duplicated');
  });

  it('duplicar como despesa de cartão escolhe cartão e fatura', async () => {
    renderModal({
      id: 'tx-av',
      description: 'Chocolate',
      amount: 50,
      account_id: 'acc-1',
      installments_total: null,
      installments_current: null,
      invoice_close: null,
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-duplicate'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-dupe-target')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-dupe-confirm'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    const payload = supabase.from('mf_transactions').insert.mock.calls[0][0][0];
    // cartão padrão (único) + fatura corrente (outubro = fecha 10/10)
    expect(payload).toMatchObject({
      type: 'DESPESA',
      account_id: 'acc-card',
      status: 'PAGO',
      invoice_close: '2026-10-10',
    });
  });

  it('visualizar parcelas abre o modal com N/M, fatura e status', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-parcels'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-parcels-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-tx-detail-parcel-tx-1')).toHaveTextContent('1/3');
    expect(screen.getByTestId('mf-tx-detail-parcel-tx-1')).toHaveTextContent('Outubro, 2026');
    expect(screen.getByTestId('mf-tx-detail-parcel-tx-2')).toHaveTextContent('2/3');
    expect(screen.getByTestId('mf-tx-detail-parcel-tx-3')).toHaveTextContent('3/3');
    expect(screen.queryByTestId('mf-tx-detail-parcels-partial')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-detail-parcels-close'));
    expect(screen.queryByTestId('mf-tx-detail-parcels-modal')).not.toBeInTheDocument();
  });

  it('série órfã avisa quantas parcelas foram encontradas', async () => {
    renderModal({
      id: 'tx-orfan',
      description: 'Canguru',
      installments_current: 1,
      installments_total: 5,
      parent_transaction_id: null,
      invoice_close: null,
      payment_date: '2026-10-20',
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu'));
    fireEvent.click(screen.getByTestId('mf-tx-detail-menu-parcels'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-parcels-partial')).toHaveTextContent(
        'minhasfinancas.tx_detail_parcels_found'
      );
    });
    expect(screen.getByTestId('mf-tx-detail-parcel-tx-orfan')).toBeInTheDocument();
  });

  it('mostra tags e badges de categoria/subcategoria', async () => {
    renderModal({}, vi.fn(), ['tag-1']);
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-tag-tag-1')).toHaveTextContent('Viagem');
    });
    expect(screen.getByTestId('mf-tx-detail-category')).toHaveTextContent('Cartões de crédito');
    expect(screen.getByTestId('mf-tx-detail-subcategory')).toHaveTextContent('Estornos');
  });

  it('editar abre a edição completa', async () => {
    const onEditFull = renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-edit'));
    expect(onEditFull).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }));
  });
});
