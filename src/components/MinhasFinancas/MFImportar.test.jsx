import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFImportar from './MFImportar';
import { downloadText } from './mfReports';
import toast from 'react-hot-toast';

vi.mock('./mfReports', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, downloadText: vi.fn() };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) =>
      opts && opts.count !== undefined ? `${key}#${opts.count}` : key,
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
      limit: vi.fn().mockReturnThis(),
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
  const transactions = makeChain({
    data: [
      // lançamento existente para a sugestão de conciliação
      {
        id: 'tx-m',
        account_id: 'acc-1',
        type: 'DESPESA',
        amount: 100,
        payment_date: '2026-09-10',
        status: 'PAGO',
        description: 'Mercado Pão',
      },
    ],
    error: null,
  });
  const batches = makeChain({
    data: [
      { id: 'b1', filename: 'extrato_out.csv', status: 'COMPLETED', total_rows: 10 },
    ],
    error: null,
  });
  const importRows = makeChain({ data: [], error: null });
  const accountTypes = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_account_types') return accountTypes;
        if (table === 'mf_transactions') return transactions;
        if (table === 'mf_import_batches') return batches;
        if (table === 'mf_import_rows') return importRows;
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

const CSV_CONTENT =
  'Data;Descrição;Valor\n' +
  '10/09/2026;Mercado Pão;-100,00\n' +
  '15/09/2026;Farmácia Local;-55,90\n';

const OFX_CONTENT = [
  '<OFX>',
  '<STMTRS>',
  '<CURDEF>BRL',
  '<BANKTRANLIST>',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>20260910',
  '<TRNAMT>-80,50',
  '<FITID>f1',
  '<MEMO>Padaria Central',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>CREDIT',
  '<DTPOSTED>20260915',
  '<TRNAMT>1500,00',
  '<FITID>f2',
  '<NAME>Salario Mensal',
  '</STMTTRN>',
  '</BANKTRANLIST>',
  '</STMTRS>',
  '</OFX>',
].join('\n');

const uploadFile = (name, content) => {
  const file = new File([content], name, { type: 'text/plain' });
  fireEvent.change(screen.getByTestId('mf-import-file'), { target: { files: [file] } });
};

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFImportar user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
};

describe('MFImportar — Importação OFX/CSV (Fase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('aceite: CSV mapeado, sugestão ignorada por padrão e gravação em lote', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-import-account')).toHaveTextContent('Nubank'));

    uploadFile('extrato.csv', CSV_CONTENT);

    await waitFor(() =>
      expect(screen.getAllByTestId('mf-import-row')).toHaveLength(2)
    );
    expect(screen.getByTestId('mf-import-file-name')).toHaveTextContent('extrato.csv');

    // mapeamento auto-detectado (gatilho mostra o cabeçalho escolhido)
    expect(screen.getByTestId('mf-import-col-date')).toHaveTextContent('Data');
    expect(screen.getByTestId('mf-import-col-description')).toHaveTextContent('Descrição');
    expect(screen.getByTestId('mf-import-col-amount')).toHaveTextContent('Valor');

    // linha com sugestão começa como "Ignorar"; sem sugestão, "Importar"
    await waitFor(() =>
      expect(screen.getByTestId('mf-import-decision-0')).toHaveTextContent(
        'minhasfinancas.import_decision_ignore'
      )
    );
    expect(screen.getByTestId('mf-import-decision-1')).toHaveTextContent(
      'minhasfinancas.import_decision_import'
    );
    expect(screen.getByTestId('mf-import-suggestion')).toHaveTextContent('Mercado Pão');
    expect(screen.getByTestId('mf-import-summary').textContent).toContain(
      '1 minhasfinancas.import_with_suggestions'
    );
    expect(screen.getAllByTestId('mf-import-row-amount')[0]).toHaveTextContent('R$ 100,00');

    fireEvent.click(screen.getByTestId('mf-import-run'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_import_batches').insert).toHaveBeenCalled();
    });

    // lote com os dados do arquivo
    expect(supabase.from('mf_import_batches').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      account_id: 'acc-1',
      filename: 'extrato.csv',
      format: 'CSV',
      status: 'PENDING',
      total_rows: 2,
    });

    // só a linha NOVA vira lançamento (a sugerida ficou ignorada)
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    const createdTxs = supabase.from('mf_transactions').insert.mock.calls[0][0];
    expect(createdTxs).toHaveLength(1);
    expect(createdTxs[0]).toMatchObject({
      user_id: 'test-user',
      account_id: 'acc-1',
      type: 'DESPESA',
      description: 'Farmácia Local',
      amount: 55.9,
      payment_date: '2026-09-15',
      status: 'PAGO',
    });

    // linhas rastreadas: ignorada com vínculo de sugestão, importada com vínculo do lançamento
    await waitFor(() => {
      expect(supabase.from('mf_import_rows').insert).toHaveBeenCalled();
    });
    const rowPayloads = supabase.from('mf_import_rows').insert.mock.calls[0][0];
    expect(rowPayloads).toHaveLength(2);
    expect(rowPayloads[0]).toMatchObject({
      status: 'IGNORED',
      suggested_transaction_id: 'tx-m',
      imported_transaction_id: null,
    });
    expect(rowPayloads[1]).toMatchObject({
      status: 'MATCHED',
      imported_transaction_id: 'created-0',
    });

    // lote concluído + sucesso + tela limpa
    expect(supabase.from('mf_import_batches').update.mock.calls[0][0]).toMatchObject({
      status: 'COMPLETED',
    });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.import_done');
    await waitFor(() => expect(screen.getByTestId('mf-import-empty')).toBeInTheDocument());
  });

  it('é possível importar também a linha com sugestão (alternando a decisão)', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-import-account')).toHaveTextContent('Nubank'));

    uploadFile('extrato.csv', CSV_CONTENT);
    await waitFor(() =>
      expect(screen.getByTestId('mf-import-decision-0')).toHaveTextContent(
        'minhasfinancas.import_decision_ignore'
      )
    );

    // alterna a linha sugerida para "Importar"
    fireEvent.click(screen.getByTestId('mf-import-decision-0'));
    expect(screen.getByTestId('mf-import-decision-0')).toHaveTextContent(
      'minhasfinancas.import_decision_import'
    );

    fireEvent.click(screen.getByTestId('mf-import-run'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    const createdTxs = supabase.from('mf_transactions').insert.mock.calls[0][0];
    expect(createdTxs).toHaveLength(2);
    expect(createdTxs.map((tx) => tx.description)).toEqual([
      'Mercado Pão',
      'Farmácia Local',
    ]);
  });

  it('lê OFX sem etapa de mapeamento', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-import-account')).toHaveTextContent('Nubank'));

    uploadFile('extrato.ofx', OFX_CONTENT);

    await waitFor(() =>
      expect(screen.getAllByTestId('mf-import-row')).toHaveLength(2)
    );
    expect(screen.queryByTestId('mf-import-mapping')).not.toBeInTheDocument();
    expect(screen.getByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByText('Salario Mensal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-import-summary').textContent).toContain(
      '0 minhasfinancas.import_with_suggestions'
    );
    // nenhuma sugestão → ambas começam como importar
    expect(screen.getByTestId('mf-import-decision-0')).toHaveTextContent(
      'minhasfinancas.import_decision_import'
    );
  });

  it('CSV com cabeçalhos desconhecidos exige mapeamento manual', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-import-account')).toHaveTextContent('Nubank'));

    uploadFile('extrato.csv', 'when;memo;sum\n10/09/2026;Compra;-10,00\n');

    await waitFor(() =>
      expect(screen.getByTestId('mf-import-mapping-warning')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('mf-import-row')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-import-col-date'));
    fireEvent.click(screen.getByTestId('mf-import-col-date-option-0'));
    fireEvent.click(screen.getByTestId('mf-import-col-amount'));
    fireEvent.click(screen.getByTestId('mf-import-col-amount-option-2'));

    await waitFor(() =>
      expect(screen.getAllByTestId('mf-import-row')).toHaveLength(1)
    );
    expect(screen.getByText('Compra')).toBeInTheDocument();
  });

  it('arquivo .ofx inválido mostra erro de leitura', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-import-file')).toBeInTheDocument());

    uploadFile('extrato.ofx', 'isto não é um extrato');

    await waitFor(() =>
      expect(screen.getByTestId('mf-import-error')).toBeInTheDocument()
    );
    expect(screen.getByTestId('mf-import-error')).toHaveTextContent(
      'minhasfinancas.import_bad_file'
    );
    expect(screen.queryByTestId('mf-import-row')).not.toBeInTheDocument();
  });

  it('mostra o histórico de importações recentes', async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('mf-import-batch')).toBeInTheDocument()
    );
    expect(screen.getByTestId('mf-import-batch')).toHaveTextContent('extrato_out.csv');
    expect(screen.getByTestId('mf-import-batch-status')).toHaveTextContent(
      'minhasfinancas.import_batch_status_COMPLETED'
    );
  });

  it('exporta os lançamentos do período em CSV (data ISO, valor e conta)', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-export')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('mf-export-from'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByTestId('mf-export-to'), {
      target: { value: '2026-09-30' },
    });

    // Só o lançamento de 10/09 do mock cai no período.
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-count')).toHaveTextContent(
        'minhasfinancas.export_count#1'
      )
    );

    fireEvent.click(screen.getByTestId('mf-export-csv'));

    expect(downloadText).toHaveBeenCalledTimes(1);
    const [csv, filename] = downloadText.mock.calls[0];
    expect(filename).toBe('lancamentos_2026-09-01_2026-09-30.csv');
    expect(csv).toContain('"Data";"Descrição";"Tipo";"Categoria";"Conta";"Valor";"Status"');
    expect(csv).toContain('"2026-09-10"');
    expect(csv).toContain('"Mercado Pão"');
    expect(csv).toContain('"Nubank"');
    expect(csv).toContain('"100,00"');
    expect(csv).toContain('"PAGO"');
  });

  it('Tipo de conta filtra pelo tipo cadastrado e a conta mostra Nome · Tipo', async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-account-type')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByTestId('mf-export-from'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByTestId('mf-export-to'), {
      target: { value: '2026-09-30' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-count')).toHaveTextContent(
        'minhasfinancas.export_count#1'
      )
    );

    // Rótulo "Nome · Tipo" e ícone da conta no seletor de contas.
    fireEvent.click(screen.getByTestId('mf-export-account'));
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-account-option-acc-1')).toHaveTextContent(
        'Nubank · minhasfinancas.acct_type_corrente'
      )
    );
    expect(
      within(screen.getByTestId('mf-export-account-option-acc-1')).getByTestId(
        'mf-export-account-icon-acc-1'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-export-account-option-acc-1'));

    // Tipos padrão agrupados em "Padrões", com o ícone do tipo.
    fireEvent.click(screen.getByTestId('mf-export-account-type'));
    await waitFor(() =>
      expect(
        screen.getByTestId('mf-export-account-type-option-CORRENTE')
      ).toBeInTheDocument()
    );
    expect(
      screen.getByTestId('mf-export-account-type-group-minhasfinancas.default_types')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('mf-export-account-type-option-CORRENTE')
    ).toHaveTextContent('🏦 minhasfinancas.type_corrente');

    // Filtra pelo tipo da conta do lançamento (CORRENTE mantém; CARTAO zera).
    fireEvent.click(screen.getByTestId('mf-export-account-type-option-CORRENTE'));
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-count')).toHaveTextContent(
        'minhasfinancas.export_count#1'
      )
    );

    fireEvent.click(screen.getByTestId('mf-export-account-type'));
    fireEvent.click(screen.getByTestId('mf-export-account-type-option-CARTAO'));
    await waitFor(() =>
      expect(screen.getByTestId('mf-export-count')).toHaveTextContent(
        'minhasfinancas.export_count#0'
      )
    );
  });

  it('sem lançamentos no período não baixa o arquivo', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mf-export')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('mf-export-from'), {
      target: { value: '2025-01-01' },
    });
    fireEvent.change(screen.getByTestId('mf-export-to'), {
      target: { value: '2025-01-31' },
    });

    await waitFor(() =>
      expect(screen.getByTestId('mf-export-count')).toHaveTextContent(
        'minhasfinancas.export_count#0'
      )
    );

    fireEvent.click(screen.getByTestId('mf-export-csv'));
    expect(downloadText).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.export_empty');
  });
});
