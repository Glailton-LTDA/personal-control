import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTagPicker from './MFTagPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

const TAGS = [
  { id: 'tag-trip', name: 'Viagem', color: '#a78bfa' },
  { id: 'tag-home', name: 'Casa', color: '#38bdf8' },
];

const insertMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        insert: (row) => {
          insertMock(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'tag-new', ...row }, error: null }),
            }),
          };
        },
      };
      return chain;
    }),
  },
}));

const renderPicker = (props = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = props.onChange ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MFTagPicker
        user={{ id: 'user-1' }}
        tags={TAGS}
        value={props.value ?? []}
        onChange={onChange}
        testId="mf-picker"
        {...props}
      />
    </QueryClientProvider>
  );
  return { onChange };
};

describe('MFTagPicker — um campo para buscar ou criar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filtra as tags pelo termo digitado', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('mf-picker-search'), {
      target: { value: 'via' },
    });
    expect(screen.getByTestId('mf-picker-option-tag-trip')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-picker-option-tag-home')).not.toBeInTheDocument();
  });

  it('marca/desmarca uma tag existente', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByTestId('mf-picker-option-tag-trip'));
    expect(onChange).toHaveBeenCalledWith(['tag-trip']);
  });

  it('oferece criar quando o termo não existe e já seleciona', async () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByTestId('mf-picker-search'), {
      target: { value: 'Gasolina' },
    });

    const create = screen.getByTestId('mf-picker-create');
    expect(create).toHaveTextContent('minhasfinancas.tag_create_named');
    fireEvent.click(create);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', name: 'Gasolina' })
      );
    });
    // cor automática definida (não fica nula)
    expect(insertMock.mock.calls[0][0].color).toMatch(/^#/);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['tag-new']);
    });
  });

  it('nome existente não oferece criar (só seleciona)', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('mf-picker-search'), {
      target: { value: 'viagem' }, // sem acento/caixa
    });
    expect(screen.queryByTestId('mf-picker-create')).not.toBeInTheDocument();
  });

  it('Concluir chama onDone', () => {
    const onDone = vi.fn();
    renderPicker({ onDone });
    fireEvent.click(screen.getByTestId('mf-picker-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
