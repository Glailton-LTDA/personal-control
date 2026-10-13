import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import MFCategoriesScreen from './MFCategoriesScreen';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// Mock Supabase — insert devolve o payload ecoado com id gerado
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
      not: vi.fn().mockReturnThis(),
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

  const categories = makeChain({
    data: [
      {
        id: 'cat-1',
        name: 'Alimentação',
        type: 'DESPESA',
        parent_id: null,
        color: '#f59e0b',
        icon: '🍔',
        is_archived: false,
      },
      {
        id: 'cat-2',
        name: 'Supermercado',
        type: 'DESPESA',
        parent_id: 'cat-1',
        color: '#10b981',
        icon: null,
        is_archived: false,
      },
      {
        id: 'cat-3',
        name: 'Receitas',
        type: 'RECEITA',
        parent_id: null,
        color: null,
        icon: null,
        is_archived: true,
      },
    ],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_categories') return categories;
        return makeChain({ data: [], error: null });
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

const renderScreen = (props = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onBack = props.onBack ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MFCategoriesScreen user={{ id: 'test-user' }} onBack={onBack} />
    </QueryClientProvider>
  );
  return { onBack };
};

describe('MFCategoriesScreen — Gerenciar categorias (Configurações)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  it('lista a árvore, expande filhos e filtra pela busca sem acento', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-row-cat-1')).toBeInTheDocument();
    });
    // filho recolhido até o chevron; raiz inativa visível (para reativar)
    expect(screen.queryByTestId('mf-cat-row-cat-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-cat-row-cat-3')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-cat-expand-cat-1'));
    expect(screen.getByTestId('mf-cat-row-cat-2')).toBeInTheDocument();

    // busca sem acento mantém a raiz cujo filho casa e esconde as demais
    fireEvent.change(screen.getByTestId('mf-cat-search'), {
      target: { value: 'superm' },
    });
    expect(screen.getByTestId('mf-cat-row-cat-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-cat-row-cat-2')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-cat-row-cat-3')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-cat-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('mf-cat-empty')).toBeInTheDocument();

    // X limpa o filtro e mostra a árvore inteira de novo
    fireEvent.click(screen.getByTestId('mf-cat-search-clear'));
    expect(screen.getByTestId('mf-cat-search')).toHaveValue('');
    expect(screen.getByTestId('mf-cat-row-cat-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-cat-row-cat-3')).toBeInTheDocument();
  });

  it('ativa/desativa com cascata nos filhos', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-active-cat-1')).toBeInTheDocument();
    });

    // cat-1 começa ativa (aria-checked true) → vira arquivada
    expect(screen.getByTestId('mf-cat-active-cat-1')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('mf-cat-active-cat-1'));

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');
    await waitFor(() => {
      expect(categories.update).toHaveBeenCalledTimes(2);
    });
    const payloads = categories.update.mock.calls.map((call) => call[0]);
    expect(payloads).toEqual([{ is_archived: true }, { is_archived: true }]);
    // o id sai do payload e vai para o .eq (raiz e filho, nessa ordem)
    expect(categories.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['id', 'cat-1'],
        ['id', 'cat-2'],
      ])
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.cfg_saved')
    );
  });

  it('cria uma categoria com ícone e cor escolhidos', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-new')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-new'));
    expect(screen.getByTestId('mf-cat-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-cat-modal-icon-0')); // 🍔
    fireEvent.click(screen.getByTestId('mf-cat-modal-color-2')); // #f97316
    fireEvent.click(screen.getByTestId('mf-cat-modal-type'));
    fireEvent.click(screen.getByTestId('mf-cat-modal-type-option-RECEITA'));
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Transporte' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');
    await waitFor(() => {
      expect(categories.insert).toHaveBeenCalled();
    });
    expect(categories.insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Transporte',
      type: 'RECEITA',
      parent_id: null,
      color: '#f97316',
      icon: '🍔',
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.cfg_saved')
    );
    expect(screen.queryByTestId('mf-cat-modal')).not.toBeInTheDocument();
  });

  it('bloqueia nome vazio e duplicado no mesmo nível', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-new')).toBeInTheDocument();
    });

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');

    // vazio
    fireEvent.click(screen.getByTestId('mf-cat-new'));
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.cfg_name_required');
    expect(categories.insert).not.toHaveBeenCalled();

    // duplicado (mesmo nome da raiz, caixa diferente)
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'alimentação' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.cfg_duplicate_category');
    expect(categories.insert).not.toHaveBeenCalled();
  });

  it('busca filtra os ícones (ex.: "combust" acha a bomba)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-new')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-new'));
    expect(screen.getByTestId('mf-cat-modal')).toBeInTheDocument();

    // sem busca: grade completa, 🍔 é o primeiro
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('🍔');

    fireEvent.change(screen.getByTestId('mf-cat-modal-icon-search'), {
      target: { value: 'combust' },
    });
    // filtrada: a bomba passa a ser a primeira
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('⛽');

    fireEvent.change(screen.getByTestId('mf-cat-modal-icon-search'), {
      target: { value: 'panda' },
    });
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('🐼');

    fireEvent.change(screen.getByTestId('mf-cat-modal-icon-search'), {
      target: { value: 'zzz-inexistente' },
    });
    expect(screen.getByTestId('mf-cat-modal-icon-empty')).toBeInTheDocument();

    // X limpa a busca e restaura a grade
    fireEvent.click(screen.getByTestId('mf-cat-modal-icon-search-clear'));
    expect(screen.getByTestId('mf-cat-modal-icon-search')).toHaveValue('');
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('🍔');
  });

  it('busca encontra novos ícones (bermuda, terno, família) e glifos (geladeira)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-new')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-new'));
    const search = screen.getByTestId('mf-cat-modal-icon-search');

    fireEvent.change(search, { target: { value: 'bermuda' } });
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('🩳');

    fireEvent.change(search, { target: { value: 'terno' } });
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('🤵');

    fireEvent.change(search, { target: { value: 'familia' } });
    expect(screen.getByTestId('mf-cat-modal-icon-0')).toHaveTextContent('👪');

    // glifo por palavra-chave em pt
    fireEvent.change(search, { target: { value: 'geladeira' } });
    expect(screen.getByTestId('mf-cat-modal-glyph-fridge')).toBeInTheDocument();
  });

  it('permite escolher marca de banco como ícone da categoria', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-new')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-new'));
    fireEvent.change(screen.getByTestId('mf-cat-modal-icon-search'), {
      target: { value: 'nubank' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-brand-nubank'));
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Nubank Heitor' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');
    await waitFor(() => {
      expect(categories.insert).toHaveBeenCalled();
    });
    expect(categories.insert.mock.calls[0][0]).toMatchObject({
      name: 'Nubank Heitor',
      icon: 'brand:nubank',
    });
  });

  it('cria subcategoria pelo + da linha com o pai pré-selecionado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-add-child-cat-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-add-child-cat-1'));
    expect(screen.getByTestId('mf-cat-modal-parent')).toHaveTextContent('Alimentação');
    // subcategoria herda o tipo do pai e não mostra o seletor de tipo
    expect(screen.queryByTestId('mf-cat-modal-type')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Padaria' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');
    await waitFor(() => {
      expect(categories.insert).toHaveBeenCalled();
    });
    expect(categories.insert.mock.calls[0][0]).toMatchObject({
      name: 'Padaria',
      parent_id: 'cat-1',
      type: 'DESPESA',
    });
  });

  it('o Adicionar subcategoria do rodapé usa a raiz expandida', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-expand-cat-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-expand-cat-3'));
    fireEvent.click(screen.getByTestId('mf-cat-new-sub'));

    expect(screen.getByTestId('mf-cat-modal-parent')).toHaveTextContent('Receitas');
  });

  it('edita categoria (salva update) e exclui com confirmação automática', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-row-cat-3')).toBeInTheDocument();
    });

    // edição
    fireEvent.click(screen.getByTestId('mf-cat-row-cat-3'));
    expect(screen.getByTestId('mf-cat-modal-name')).toHaveValue('Receitas');
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Entradas' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    const categories = supabase.from('mf_categories');
    await waitFor(() => {
      expect(categories.update).toHaveBeenCalled();
    });
    expect(categories.update.mock.calls[0][0]).toMatchObject({ name: 'Entradas' });
    expect(categories.eq).toHaveBeenCalledWith('id', 'cat-3');
    expect(screen.queryByTestId('mf-cat-modal')).not.toBeInTheDocument();

    // exclusão (raiz com filho: apaga o filho antes do pai — FK)
    fireEvent.click(screen.getByTestId('mf-cat-row-cat-1'));
    fireEvent.click(screen.getByTestId('mf-cat-modal-delete'));
    await waitFor(() => {
      expect(categories.delete).toHaveBeenCalledTimes(2);
    });
    const eqCalls = categories.eq.mock.calls;
    const lastTwo = eqCalls.slice(-2);
    expect(lastTwo[0]).toEqual(['id', 'cat-2']);
    expect(lastTwo[1]).toEqual(['id', 'cat-1']);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.cfg_deleted')
    );
  });

  it('volta para as Configurações pelo cabeçalho', async () => {
    const { onBack } = renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-back')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-cat-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
