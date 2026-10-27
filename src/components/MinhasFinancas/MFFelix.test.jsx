import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFFelix from './MFFelix';

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

// Mock Supabase
vi.mock('../../lib/supabase', () => {
  const makeChain = (result) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
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
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', currency: 'BRL', sort_order: 1 },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [{ id: 'cat-1', name: 'Alimentação', parent_id: null }],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        return makeChain({ data: [], error: null });
      }),
      functions: { invoke: vi.fn() },
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const renderScreen = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MFFelix user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
  // deixa as queries de contas/categorias assentarem antes dos testes
  await act(async () => {});
  return utils;
};

const typeAndSend = async (text) => {
  fireEvent.change(screen.getByTestId('felix-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('felix-send'));
};

describe('MFFelix — Assistente Felix (Fase 8)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabase } = await import('../../lib/supabase');
    supabase.functions.invoke.mockResolvedValue({
      data: { reply: 'Resposta do Felix.', configured: true, toolsUsed: ['resumo_mes'] },
      error: null,
    });
  });

  it('envia a pergunta com histórico e contexto de IDs e exibe a resposta', async () => {
    const { supabase } = await import('../../lib/supabase');
    await renderScreen();

    expect(screen.getByTestId('felix-welcome')).toBeInTheDocument();

    await typeAndSend('Quanto gastei este mês?');
    expect(screen.getByTestId('felix-msg-user')).toHaveTextContent('Quanto gastei este mês?');

    await waitFor(() =>
      expect(screen.getByTestId('felix-msg-assistant')).toHaveTextContent('Resposta do Felix.')
    );

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = supabase.functions.invoke.mock.calls[0];
    expect(fnName).toBe('finance-ai');
    expect(options.body.messages).toEqual([
      { role: 'user', content: 'Quanto gastei este mês?' },
    ]);
    expect(options.body.context.language).toBe('pt-BR');
    expect(options.body.context.accounts).toEqual([
      { id: 'acc-1', name: 'Nubank', type: 'CORRENTE', currency: 'BRL' },
    ]);
    expect(options.body.context.categories).toEqual([
      { id: 'cat-1', name: 'Alimentação', parent_id: null },
    ]);
  });

  it('funciona sem a secret: mostra a mensagem de IA não ativada', async () => {
    const { supabase } = await import('../../lib/supabase');
    supabase.functions.invoke.mockResolvedValue({
      data: { reply: '', configured: false, toolsUsed: [] },
      error: null,
    });
    await renderScreen();

    await typeAndSend('Olá');

    await waitFor(() =>
      expect(screen.getByTestId('felix-msg-error')).toHaveTextContent(
        'minhasfinancas.felix_not_configured'
      )
    );
  });

  it('erro de invocação vira mensagem de erro no chat', async () => {
    const { supabase } = await import('../../lib/supabase');
    supabase.functions.invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await renderScreen();

    await typeAndSend('Olá');

    await waitFor(() =>
      expect(screen.getByTestId('felix-msg-error')).toHaveTextContent(
        'minhasfinancas.felix_error'
      )
    );
  });

  it('modelo do Gemini indisponível vira mensagem específica com o detalhe', async () => {
    const { supabase } = await import('../../lib/supabase');
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          clone: () => ({
            json: async () => ({
              code: 'model',
              status: 404,
              detail: 'models/gemini-3.6-flash is not found',
            }),
          }),
        },
      },
    });
    await renderScreen();

    await typeAndSend('Olá');

    await waitFor(() =>
      expect(screen.getByTestId('felix-msg-error')).toHaveTextContent(
        'minhasfinancas.felix_error_model'
      )
    );
    expect(screen.getByTestId('felix-msg-error')).toHaveTextContent(
      'models/gemini-3.6-flash is not found'
    );
  });

  it('chave recusada (401/403) vira mensagem de chave', async () => {
    const { supabase } = await import('../../lib/supabase');
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          clone: () => ({ json: async () => ({ code: 'auth', status: 403 }) }),
        },
      },
    });
    await renderScreen();

    await typeAndSend('Olá');

    await waitFor(() =>
      expect(screen.getByTestId('felix-msg-error')).toHaveTextContent(
        'minhasfinancas.felix_error_key'
      )
    );
  });

  it('sugestões clicáveis enviam a pergunta', async () => {
    const { supabase } = await import('../../lib/supabase');
    await renderScreen();

    fireEvent.click(screen.getAllByTestId('felix-suggestion')[0]);

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    const [, options] = supabase.functions.invoke.mock.calls[0];
    expect(options.body.messages).toEqual([
      { role: 'user', content: 'minhasfinancas.felix_suggest_1' },
    ]);
    await waitFor(() => expect(screen.getByTestId('felix-msg-assistant')).toBeInTheDocument());
  });

  it('limpar conversa volta para a boas-vindas', async () => {
    await renderScreen();

    await typeAndSend('Olá');
    await waitFor(() => expect(screen.getByTestId('felix-msg-assistant')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('felix-clear'));
    expect(screen.getByTestId('felix-welcome')).toBeInTheDocument();
    expect(screen.queryByTestId('felix-msg-user')).not.toBeInTheDocument();
    expect(screen.getByTestId('felix-input')).toHaveValue('');
  });
});
