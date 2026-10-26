import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTransacoes from './MFTransacoes';
import { planFixedExtensions } from '../../hooks/useMinhasFinancas';

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

/**
 * Mock Supabase com cadeia POR CHAMADA: filtros `eq` valem de verdade
 * (a exclusão de série busca cabeça e filhas por eq) e um gravador
 * comum registra inserts/updates/deletes para as asserções.
 */
vi.mock('../../lib/supabase', () => {
  const calls = { inserts: [], updates: [], deleteIds: [] };

  const DATA = {
    mf_accounts: [
      { id: 'acc-1', name: 'Nubank', currency: 'BRL', initial_balance: 100, color: '#6366f1', sort_order: 0 },
      { id: 'acc-2', name: 'Inter', currency: 'BRL', initial_balance: 200, color: '#f59e0b', sort_order: 1 },
    ],
    mf_categories: [],
    mf_tags: [{ id: 'tag-trip', name: 'Viagem', color: '#06b6d4' }],
    mf_transaction_tags: [],
    // Série fixa: cabeça (ago) + filhas (set/out/nov) + um lançamento comum
    mf_transactions: [
      {
        id: 'tx-fix-head',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aluguel',
        amount: 2500,
        payment_date: '2026-08-15',
        due_date: '2026-08-20',
        status: 'PAGO',
        effective_date: '2026-08-20',
        category_id: null,
        recurrence: 'MONTHLY',
        is_fixed: true,
        parent_transaction_id: null,
      },
      {
        id: 'tx-fix-c1',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aluguel',
        amount: 2500,
        payment_date: '2026-09-15',
        due_date: '2026-09-20',
        status: 'PAGO',
        effective_date: '2026-09-20',
        category_id: null,
        recurrence: 'MONTHLY',
        is_fixed: true,
        parent_transaction_id: 'tx-fix-head',
      },
      {
        id: 'tx-fix-c2',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aluguel',
        amount: 2500,
        payment_date: '2026-10-15',
        due_date: '2026-10-20',
        status: 'PENDENTE',
        effective_date: null,
        category_id: null,
        recurrence: 'MONTHLY',
        is_fixed: true,
        parent_transaction_id: 'tx-fix-head',
      },
      {
        id: 'tx-fix-c3',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aluguel',
        amount: 2500,
        payment_date: '2026-11-20',
        due_date: '2026-11-20',
        status: 'PENDENTE',
        effective_date: null,
        category_id: null,
        recurrence: 'MONTHLY',
        is_fixed: true,
        parent_transaction_id: 'tx-fix-head',
      },
      {
        id: 'tx-plain',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Mercado',
        amount: 90,
        payment_date: '2026-10-05',
        due_date: null,
        status: 'PENDENTE',
        effective_date: null,
        category_id: null,
        recurrence: 'NONE',
      },
    ],
  };

  const makeChain = (table) => {
    const state = { filters: [], inserted: null, single: false, pendingUpdate: null };
    const chain = {};
    const flush = () => {
      if (state.pendingUpdate) {
        calls.updates.push(state.pendingUpdate);
        state.pendingUpdate = null;
      }
    };
    const resolve = () => {
      flush();
      if (state.inserted) {
        return state.single
          ? { data: state.inserted[0] ?? null, error: null }
          : { data: state.inserted, error: null };
      }
      let rows = DATA[table] ?? [];
      for (const match of state.filters) {
        rows = rows.filter(match);
      }
      if (state.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };

    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn((rows) => {
      const list = (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: `created-${index}`,
        ...row,
      }));
      state.inserted = list;
      calls.inserts.push({ table, rows: list });
      return chain;
    });
    chain.update = vi.fn((patch) => {
      state.pendingUpdate = { patch, ids: null };
      return chain;
    });
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn((field, value) => {
      if (state.pendingUpdate && field === 'id') state.pendingUpdate.ids = [value];
      state.filters.push((row) => row[field] === value);
      return chain;
    });
    chain.in = vi.fn((field, values) => {
      if (state.pendingUpdate) {
        state.pendingUpdate.ids = values;
        flush();
      } else {
        calls.deleteIds.push(values);
        state.filters.push((row) => values.includes(row[field]));
      }
      return chain;
    });
    chain.order = vi.fn(() => chain);
    // useMFAccountTransactions (modal Detalhes) usa .or — aqui vira no-op
    chain.or = vi.fn(() => chain);
    chain.gte = vi.fn((field, value) => {
      state.filters.push((row) => String(row[field]) >= String(value));
      return chain;
    });
    chain.lte = vi.fn((field, value) => {
      state.filters.push((row) => String(row[field]) <= String(value));
      return chain;
    });
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(() => {
      state.single = true;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      state.single = true;
      return chain;
    });
    chain.then = vi.fn((onFulfilled, onRejected) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    );
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table) => makeChain(table)),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
    __calls: calls,
  };
});

const renderScreen = (monthKey = '2026-10') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFTransacoes
        user={{ id: 'test-user' }}
        monthKey={monthKey}
        onChangeMonth={() => {}}
      />
    </QueryClientProvider>
  );
};

const openAdd = (kind = 'expense') => {
  fireEvent.click(screen.getByTestId('mf-new-tx'));
  fireEvent.click(screen.getByTestId(`mf-add-opt-${kind}`));
};

/** Lápis da linha → modal Detalhes → Editar → tela completa. */
const openDetailEdit = async (rowTestId) => {
  fireEvent.click(screen.getByTestId(rowTestId));
  await waitFor(() => {
    expect(screen.getByTestId('mf-tx-detail')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('mf-tx-detail-edit'));
  await waitFor(() => {
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
  });
};

const getCalls = async () => (await import('../../lib/supabase')).__calls;
// vi.clearAllMocks() não zera arrays próprios do mock — limpamos na mão.
const resetCalls = async () => {
  const calls = await getCalls();
  calls.inserts.length = 0;
  calls.updates.length = 0;
  calls.deleteIds.length = 0;
};
const txInserts = (calls) => calls.inserts.filter((row) => row.table === 'mf_transactions');

describe('Série fixa — criação', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetCalls();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('seleciona "Fixa mensal", mostra a dica e grava 12 ocorrências', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Aluguel' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '2.500,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-10-15' },
    });

    // Modo fixa seleciona sem abrir modal e exibe a dica
    fireEvent.click(screen.getByTestId('mf-tx-repeat-fixed'));
    expect(screen.getByTestId('mf-tx-repeat-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-repeat-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-repeat-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    // 'Aluguel' fixa já existe em out/nov → confirma antes de duplicar
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-dupe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-dupe-option-continue'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(txInserts(calls)).toHaveLength(2);
    });

    // 1ª chamada: cabeça da série
    const [head] = txInserts(calls)[0].rows;
    expect(head).toMatchObject({
      description: 'Aluguel',
      recurrence: 'MONTHLY',
      is_fixed: true,
      payment_date: '2026-10-15',
    });
    expect(head).not.toHaveProperty('parent_transaction_id');

    // 2ª chamada: 11 filhas mensais ligadas à cabeça, todas pendentes
    const children = txInserts(calls)[1].rows;
    expect(children).toHaveLength(11);
    expect(children[0]).toMatchObject({
      parent_transaction_id: head.id,
      recurrence: 'MONTHLY',
      is_fixed: true,
      payment_date: '2026-11-15',
      status: 'PENDENTE',
      effective_date: null,
    });
    expect(children[0]).not.toHaveProperty('installments_current');
    expect(children[10]).toMatchObject({
      payment_date: '2027-09-15',
      parent_transaction_id: head.id,
    });
  });

  it('selecionar "Parcelar ou repetir" abre o modal e resume a configuração', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    expect(screen.getByTestId('mf-repeat-modal')).toBeInTheDocument();

    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByTestId('mf-repeat-quantity-inc'));
    }
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));

    expect(screen.queryByTestId('mf-repeat-modal')).not.toBeInTheDocument();
    // t() do mock devolve a chave (interpolação não é resolvida)
    expect(screen.getByTestId('mf-tx-repeat-summary')).toHaveTextContent(
      'minhasfinancas.tx_repeat_summary'
    );
  });
});

describe('Série fixa — badge e exclusão', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetCalls();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('mostra o selo "Fixa" na lista', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });
    // Só a fixa (c2) ganha o selo — a comum não
    expect(screen.getAllByTestId('mf-tx-fixed-badge')).toHaveLength(1);
  });

  it('exclusão pergunta o escopo; "a partir deste mês" zera is_fixed na cabeça', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-tx-delete-tx-fix-c2'));

    expect(screen.getByTestId('mf-fixed-delete-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('mf-fixed-delete-dialog-title')).toHaveTextContent(
      'minhasfinancas.tx_delete_fixed_title'
    );
    expect(screen.getByTestId('mf-fixed-delete-dialog-body')).toHaveTextContent(
      'minhasfinancas.tx_delete_fixed_body'
    );
    expect(screen.getByTestId('mf-fixed-delete-one')).toBeInTheDocument();
    expect(screen.getByTestId('mf-fixed-delete-from')).toBeInTheDocument();
    expect(screen.getByTestId('mf-fixed-delete-all')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-fixed-delete-from'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(calls.deleteIds.flat()).toContain('tx-fix-c2');
    });
    // Cabeça sobrevive fora da moda fixa → estensão para
    expect(calls.deleteIds.flat()).not.toContain('tx-fix-head');
    expect(
      calls.updates.some(
        (update) =>
          update.patch.is_fixed === false &&
          Array.isArray(update.ids) &&
          update.ids.includes('tx-fix-head')
      )
    ).toBe(true);
    expect(screen.queryByTestId('mf-fixed-delete-dialog')).not.toBeInTheDocument();
  });

  it('"apenas este mês" apaga só a ocorrência escolhida', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-tx-delete-tx-fix-c2'));
    fireEvent.click(screen.getByTestId('mf-fixed-delete-one'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(calls.deleteIds.flat()).toEqual(['tx-fix-c2']);
    });
    expect(calls.updates).toHaveLength(0);
  });

  it('"excluir definitivamente" apaga a série inteira', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-tx-delete-tx-fix-c2'));
    fireEvent.click(screen.getByTestId('mf-fixed-delete-all'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(calls.deleteIds.flat()).toContain('tx-fix-head');
    });
    // cabeça + 3 filhas
    expect(calls.deleteIds.flat()).toHaveLength(4);
  });

  it('excluir a CABEÇA promove a primeira filha antes de apagar (sem cascata)', async () => {
    renderScreen('2026-08');
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('mf-tx-delete-tx-fix-head'));
    fireEvent.click(screen.getByTestId('mf-fixed-delete-one'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(calls.deleteIds.flat()).toEqual(['tx-fix-head']);
    });
    // Irmãs re-apontadas para a promotora, promotora vira cabeça
    expect(
      calls.updates.some(
        (update) =>
          update.patch.parent_transaction_id === 'tx-fix-c1' &&
          Array.isArray(update.ids) &&
          update.ids.includes('tx-fix-c2')
      )
    ).toBe(true);
    expect(
      calls.updates.some(
        (update) =>
          update.patch.parent_transaction_id === null &&
          Array.isArray(update.ids) &&
          update.ids.includes('tx-fix-c1')
      )
    ).toBe(true);
  });
});

describe('Série fixa — edição com escopo', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetCalls();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('pergunta o escopo; "a partir deste mês" atualiza daqui em diante sem mexer nas datas', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    await openDetailEdit('mf-tx-edit-tx-fix-c2');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Aluguel reajustado' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    // igual à exclusão: pergunta antes de gravar
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-edit-fixed-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-tx-edit-fixed-dialog-title')).toHaveTextContent(
      'minhasfinancas.tx_edit_fixed_title'
    );
    expect(screen.getByTestId('mf-tx-edit-fixed-one')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-edit-fixed-from')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-edit-fixed-all')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-edit-fixed-from'));

    const calls = await getCalls();
    // este (ocorrência em edição): update completo com o form
    await waitFor(() => {
      expect(
        calls.updates.some(
          (u) =>
            Array.isArray(u.ids) &&
            u.ids.includes('tx-fix-c2') &&
            u.patch.description === 'Aluguel reajustado'
        )
      ).toBe(true);
    });
    const single = calls.updates.find(
      (u) => Array.isArray(u.ids) && u.ids.length === 1 && u.ids[0] === 'tx-fix-c2'
    );
    expect(single.patch).toMatchObject({ payment_date: '2026-10-15' });

    // bulk: só as próximas (novembro) — conteúdo, sem data/fatura
    const bulk = calls.updates.find(
      (u) => Array.isArray(u.ids) && u.ids.includes('tx-fix-c3')
    );
    expect(bulk).toBeTruthy();
    expect(bulk.patch).toMatchObject({ description: 'Aluguel reajustado' });
    expect(bulk.patch).not.toHaveProperty('payment_date');
    expect(bulk.patch).not.toHaveProperty('due_date');

    // meses anteriores (cabeça e setembro) ficam intocados
    expect(calls.updates.some((u) => u.ids?.includes('tx-fix-head'))).toBe(false);
    expect(calls.updates.some((u) => u.ids?.includes('tx-fix-c1'))).toBe(false);
    expect(screen.queryByTestId('mf-tx-edit-fixed-dialog')).not.toBeInTheDocument();
  });

  it('"editar apenas este mês" grava só a ocorrência escolhida', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    await openDetailEdit('mf-tx-edit-tx-fix-c2');
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '2.750,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-edit-fixed-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-edit-fixed-one'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(
        calls.updates.some((u) => Array.isArray(u.ids) && u.ids.includes('tx-fix-c2'))
      ).toBe(true);
    });
    expect(calls.updates.some((u) => u.ids?.includes('tx-fix-c3'))).toBe(false);
    expect(calls.updates.some((u) => u.ids?.includes('tx-fix-head'))).toBe(false);
  });
});

describe('Série fixa — efetivação em outro mês', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetCalls();
    localStorage.setItem('pc_skip_confirmations', 'true');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('pergunta onde contabilizar; "no vencimento" preserva a competência', async () => {
    renderScreen('2026-11');
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    });

    // Fixa de novembro efetivada em outubro (hoje) → diálogo
    fireEvent.click(screen.getByTestId('mf-tx-pay-tx-fix-c3'));

    expect(screen.getByTestId('mf-settle-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('mf-settle-dialog-title')).toHaveTextContent(
      'minhasfinancas.settle_title'
    );
    expect(screen.getByTestId('mf-settle-dialog-body')).toHaveTextContent(
      'minhasfinancas.settle_body1'
    );
    expect(screen.getByTestId('mf-settle-due')).toHaveTextContent(
      'minhasfinancas.settle_due'
    );
    expect(screen.getByTestId('mf-settle-now')).toHaveTextContent(
      'minhasfinancas.settle_now'
    );

    fireEvent.click(screen.getByTestId('mf-settle-due'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(
        calls.updates.some((update) => update.patch.status === 'PAGO')
      ).toBe(true);
    });
    const payPatches = calls.updates.filter((update) => update.patch.status === 'PAGO');
    expect(payPatches[0].patch.effective_date).toBe('2026-11-20'); // vencimento
    expect(payPatches[0].patch).not.toHaveProperty('payment_date');
    expect(screen.queryByTestId('mf-settle-dialog')).not.toBeInTheDocument();
  });

  it('"contabilizar em <mês>" move a competência para hoje', async () => {
    renderScreen('2026-11');
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('mf-tx-pay-tx-fix-c3'));
    expect(screen.getByTestId('mf-settle-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-settle-now'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(
        calls.updates.some((update) => update.patch.payment_date === '2026-10-04')
      ).toBe(true);
    });
    const moved = calls.updates.find((update) => update.patch.payment_date === '2026-10-04');
    expect(moved.patch).toMatchObject({
      status: 'PAGO',
      effective_date: '2026-10-04',
      payment_date: '2026-10-04',
    });
  });

  it('fixa do mês corrente efetiva direto, sem diálogo', async () => {
    renderScreen('2026-10');
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('mf-tx-pay-tx-fix-c2'));

    await waitFor(() => {
      expect(screen.queryByTestId('mf-settle-dialog')).not.toBeInTheDocument();
    });
    const calls = await getCalls();
    expect(calls.updates.some((update) => update.patch.status === 'PAGO')).toBe(true);
  });
});

describe('planFixedExtensions (puro)', () => {
  const head = {
    id: 'head-1',
    user_id: 'u1',
    account_id: 'acc-1',
    type: 'DESPESA',
    description: 'Aluguel',
    amount: 2500,
    payment_date: '2026-08-15',
    due_date: '2026-08-20',
    status: 'PAGO',
    category_id: 'cat-1',
    recurrence: 'MONTHLY',
    is_fixed: true,
    parent_transaction_id: null,
  };
  const child = (id, payment, due, extra = {}) => ({
    ...head,
    id,
    payment_date: payment,
    due_date: due,
    status: 'PENDENTE',
    effective_date: null,
    description: 'Aluguel reajustado',
    parent_transaction_id: 'head-1',
    ...extra,
  });

  it('estende até ~12 meses clonando a última ocorrência da série', () => {
    const rows = [head, child('c1', '2026-09-15', '2026-09-20'), child('c2', '2026-10-15', '2026-10-20')];
    const planned = planFixedExtensions(rows, '2026-10-04');

    expect(planned.length).toBeGreaterThanOrEqual(11);
    expect(planned[0]).toMatchObject({
      payment_date: '2026-11-15',
      due_date: '2026-11-20',
      parent_transaction_id: 'head-1',
      is_fixed: true,
      status: 'PENDENTE',
      effective_date: null,
      // clona a ÚLTIMA ocorrência (edições recentes)
      description: 'Aluguel reajustado',
      amount: 2500,
    });
    expect(planned[0]).not.toHaveProperty('id');
    // teto: não passa de ~12 meses à frente de hoje
    expect(planned[planned.length - 1].payment_date <= '2027-10-04').toBe(true);
  });

  it('série encerrada (cabeça is_fixed=false) não gera nada', () => {
    const rows = [{ ...head, is_fixed: false }, child('c1', '2026-09-15', '2026-09-20')];
    expect(planFixedExtensions(rows, '2026-10-04')).toEqual([]);
  });

  it('já com 6+ meses futuros não gera nada', () => {
    const rows = [head, child('c1', '2027-06-15', '2027-06-20')];
    expect(planFixedExtensions(rows, '2026-10-04')).toEqual([]);
  });

  it('entrada vazia/inválida vira lista vazia', () => {
    expect(planFixedExtensions(null, '2026-10-04')).toEqual([]);
    expect(planFixedExtensions([], '2026-10-04')).toEqual([]);
  });
});
