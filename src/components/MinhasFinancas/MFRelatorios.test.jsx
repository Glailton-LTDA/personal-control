import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFRelatorios from './MFRelatorios';

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

// jsPDF: classe esvaziada com rastro de instâncias (o PDF real é coberto
// pelo módulo de export — aqui validamos a chamada)
vi.mock('jspdf', () => {
  const instances = [];
  class MockJsPDF {
    constructor() {
      instances.push(this);
      this.internal = {
        pageSize: { width: 210, height: 297 },
        getNumberOfPages: () => 1,
      };
      this.setFontSize = vi.fn();
      this.setTextColor = vi.fn();
      this.text = vi.fn();
      this.setDrawColor = vi.fn();
      this.line = vi.fn();
      this.save = vi.fn();
    }
  }
  MockJsPDF.instances = instances;
  return { default: MockJsPDF };
});
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

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
      single: vi.fn().mockReturnThis(),
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
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', currency: 'BRL', initial_balance: 1000 },
      { id: 'acc-2', name: 'USD Account', account_type: 'CORRENTE', currency: 'USD', initial_balance: 500 },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [
      { id: 'cat-food', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b' },
      { id: 'cat-market', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-food', color: '#10b981' },
      { id: 'cat-fun', name: 'Lazer', type: 'DESPESA', parent_id: null, color: '#a855f7' },
    ],
    error: null,
  });
  const tags = makeChain({ data: [{ id: 'tag-trip', name: 'Viagem', color: '#06b6d4' }], error: null });
  const transactions = makeChain({
    data: [
      { id: 't1', account_id: 'acc-1', type: 'RECEITA', amount: 5000, payment_date: '2026-05-01', status: 'PAGO', description: 'Salário', category_id: null },
      { id: 't2', account_id: 'acc-1', type: 'DESPESA', amount: 800, payment_date: '2026-05-10', status: 'PAGO', description: 'Mercado', category_id: 'cat-food' },
      { id: 't3', account_id: 'acc-1', type: 'DESPESA', amount: 400, payment_date: '2026-06-15', status: 'PAGO', description: 'Feira', category_id: 'cat-market' },
      { id: 't4', account_id: 'acc-1', type: 'DESPESA', amount: 300, payment_date: '2026-06-20', status: 'PAGO', description: 'Cinema', category_id: 'cat-fun' },
      // fora do período padrão (6 meses: 2026-05 a 2026-10)
      { id: 't5', account_id: 'acc-1', type: 'DESPESA', amount: 250, payment_date: '2026-01-10', status: 'PAGO', description: 'Show', category_id: 'cat-fun' },
      // cancelado: ignorado
      { id: 't6', account_id: 'acc-1', type: 'DESPESA', amount: 100, payment_date: '2026-09-01', status: 'CANCELADO', description: 'Estorno', category_id: 'cat-fun' },
      // transferência: fora do relatório
      { id: 't7', account_id: 'acc-1', transfer_account_id: 'acc-2', type: 'TRANSFERENCIA', amount: 500, payment_date: '2026-07-01', status: 'PAGO', description: 'Transferência' },
      { id: 't8', account_id: 'acc-1', type: 'DESPESA', amount: 150, payment_date: '2026-09-20', status: 'PAGO', description: 'Diversos', category_id: null },
      // outra moeda: fora com moeda BRL
      { id: 't9', account_id: 'acc-2', type: 'DESPESA', amount: 90, payment_date: '2026-09-25', status: 'PAGO', description: 'US purchase', category_id: 'cat-fun' },
    ],
    error: null,
  });
  const transactionTags = makeChain({
    data: [{ transaction_id: 't4', tag_id: 'tag-trip' }],
    error: null,
  });
  const savedReports = makeChain({
    data: [
      {
        id: 'rep-1',
        name: 'Primeiro semestre',
        filters: {
          from: '2026-01',
          to: '2026-06',
          type: 'ALL',
          category_id: '',
          account_id: '',
          tag_id: '',
          currency: 'BRL',
        },
      },
    ],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return transactionTags;
        if (table === 'mf_saved_reports') return savedReports;
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

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFRelatorios user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
};

let anchorClickSpy = null;

describe('MFRelatorios — Relatórios (Fase 6)', () => {
  beforeAll(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('pc_skip_confirmations');
    // restore SOMENTE o spy do anchor (vi.restoreAllMocks quebraria os
    // mocks de factory: select/insert passam a retornar undefined)
    if (anchorClickSpy) {
      anchorClickSpy.mockRestore();
      anchorClickSpy = null;
    }
  });

  it('KPIs padrão (6 meses, BRL): ignora cancelados, transferências e outras moedas', async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('mf-report-kpi-value-income')).toHaveTextContent(
        'R$ 5.000,00'
      )
    );

    expect(screen.getByTestId('mf-report-kpi-value-expense')).toHaveTextContent('R$ 1.650,00');
    expect(screen.getByTestId('mf-report-kpi-value-balance')).toHaveTextContent('R$ 3.350,00');
    // 67% de poupança · 5 lançamentos (5000, 800, 400, 300, 150)
    expect(screen.getByTestId('mf-report-kpi-saving-value')).toHaveTextContent('67%');
    expect(screen.getByTestId('mf-report-count')).toHaveTextContent('5');
    expect(screen.getAllByTestId('mf-report-row')).toHaveLength(5);
  });

  it('aceite: jan–jun com filtro de categoria (pai inclui filhos)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-report-from')).toBeInTheDocument();
    });

    // Período jan–jun + categoria Alimentação
    fireEvent.change(screen.getByTestId('mf-report-from'), { target: { value: '2026-01' } });
    fireEvent.change(screen.getByTestId('mf-report-to'), { target: { value: '2026-06' } });
    fireEvent.click(screen.getByTestId('mf-report-category'));
    fireEvent.click(screen.getByTestId('mf-report-category-option-cat-food'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-report-kpi-value-expense')).toHaveTextContent('R$ 1.200,00');
    });
    // t2 (pai) + t3 (filha Supermercado)
    expect(screen.getAllByTestId('mf-report-row')).toHaveLength(2);
    expect(screen.getByTestId('mf-report-kpi-value-income')).toHaveTextContent('R$ 0,00');
  });

  it('salva o filtro atual em mf_saved_reports', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-report-save')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-report-save'));
    fireEvent.change(screen.getByTestId('mf-report-save-name'), {
      target: { value: 'Meu relatório' },
    });
    fireEvent.click(screen.getByTestId('mf-report-save-confirm'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_saved_reports').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_saved_reports').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Meu relatório',
      filters: {
        from: '2026-05', // 6 meses inclusos: mai/26 a out/26
        to: '2026-10',
        type: 'ALL',
        currency: 'BRL',
      },
    });
  });

  it('aplica e exclui um filtro salvo', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-report-apply-rep-1')).toBeInTheDocument();
    });

    // Aplica: período do filtro salvo entra nos campos
    fireEvent.click(screen.getByTestId('mf-report-apply-rep-1'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-report-from')).toHaveValue('2026-01');
    });
    expect(screen.getByTestId('mf-report-to')).toHaveValue('2026-06');

    // Exclui (confirmação automática nos testes)
    fireEvent.click(screen.getByTestId('mf-report-del-rep-1'));
    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_saved_reports').delete).toHaveBeenCalled();
    });
    expect(supabase.from('mf_saved_reports').eq).toHaveBeenCalledWith('id', 'rep-1');
  });

  it('exporta o CSV dos lançamentos filtrados', async () => {
    anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('mf-report-count')).toHaveTextContent('5')
    );

    fireEvent.click(screen.getByTestId('mf-report-csv'));

    expect(URL.createObjectURL).toHaveBeenCalled();
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    expect(text).toContain('"minhasfinancas.report_th_date";"minhasfinancas.report_th_description"');
    expect(text).toContain('Salário');
    expect(anchorClickSpy).toHaveBeenCalled();
  });

  it('exporta o XLS (SpreadsheetML) com resumo e detalhe', async () => {
    anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('mf-report-count')).toHaveTextContent('5')
    );

    fireEvent.click(screen.getByTestId('mf-report-xls'));

    expect(URL.createObjectURL).toHaveBeenCalled();
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.ms-excel');
    const text = await blob.text();
    expect(text).toContain('<?mso-application progid="Excel.Sheet"?>');
    // o mock de i18n devolve a chave como texto (t = key => key)
    expect(text).toContain('ss:Name="nav.sub.minhasfinancas.transactions"');
    expect(text).toContain('Salário');
    expect(text).toContain('<Data ss:Type="Number">');
    expect(anchorClickSpy).toHaveBeenCalled();
  });

  it('gera o PDF do relatório filtrado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-report-pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-report-pdf'));

    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    expect(jsPDF.instances.length).toBeGreaterThan(0);
    expect(jsPDF.instances[0].save).toHaveBeenCalled();
    expect(autoTable).toHaveBeenCalled();
  });
});
