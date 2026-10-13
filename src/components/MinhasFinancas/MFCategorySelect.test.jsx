import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFCategorySelect from './MFCategorySelect';

// Mock react-i18next (mesmo padrão dos demais testes do módulo)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

const categories = [
  { id: 'cat-1', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b', icon: '🍔' },
  { id: 'cat-2', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-1', color: '#10b981', icon: null },
  { id: 'cat-3', name: 'Casa', type: 'DESPESA', parent_id: null, color: null, icon: '🏠' },
];

const renderSelect = (props = {}) => {
  const onChange = props.onChange ?? vi.fn();
  const view = render(
    <MFCategorySelect
      value={props.value ?? ''}
      onChange={onChange}
      categories={categories}
      placeholder="Nenhuma"
      testId="mf-tx-category"
    />
  );
  return { ...view, onChange };
};

describe('MFCategorySelect — seletor em árvore do lançamento', () => {
  it('mostra placeholder no gatilho e a categoria selecionada', () => {
    const { unmount } = renderSelect();
    expect(screen.getByTestId('mf-tx-category')).toHaveTextContent('Nenhuma');
    unmount();

    renderSelect({ value: 'cat-2' });
    expect(screen.getByTestId('mf-tx-category')).toHaveTextContent('Supermercado');
  });

  it('abre o painel com a árvore e seleciona uma subcategoria', () => {
    const { onChange } = renderSelect();

    fireEvent.click(screen.getByTestId('mf-tx-category'));
    expect(screen.getByTestId('mf-tx-category-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-category-search')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-category-option-none')).toBeInTheDocument();

    // raízes visíveis; filho recolhido até o chevron
    expect(screen.getByTestId('mf-tx-category-option-cat-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-category-option-cat-3')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-category-option-cat-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-category-expand-cat-1'));
    expect(screen.getByTestId('mf-tx-category-option-cat-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-category-option-cat-2'));
    expect(onChange).toHaveBeenCalledWith('cat-2');
    // fecha ao escolher
    expect(screen.queryByTestId('mf-tx-category-panel')).not.toBeInTheDocument();
  });

  it('seleciona uma categoria raiz', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.click(screen.getByTestId('mf-tx-category-option-cat-1'));
    expect(onChange).toHaveBeenCalledWith('cat-1');
  });

  it('filtra pela busca sem acento e mostra o vazio', () => {
    renderSelect();
    fireEvent.click(screen.getByTestId('mf-tx-category'));

    // "alimentacao" sem acento casa com "Alimentação"
    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'alimentacao' },
    });
    expect(screen.getByTestId('mf-tx-category-option-cat-1')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-category-option-cat-3')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('mf-tx-category-none')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-category-option-cat-1')).not.toBeInTheDocument();
  });

  it('filtra pela busca sem acento, mostra o vazio e limpa com o X', () => {
    renderSelect();
    fireEvent.click(screen.getByTestId('mf-tx-category'));

    // "alimentacao" sem acento casa com "Alimentação"
    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'alimentacao' },
    });
    expect(screen.getByTestId('mf-tx-category-option-cat-1')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-category-option-cat-3')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('mf-tx-category-none')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-category-option-cat-1')).not.toBeInTheDocument();

    // X limpa o filtro e devolve a árvore inteira
    fireEvent.click(screen.getByTestId('mf-tx-category-search-clear'));
    expect(screen.getByTestId('mf-tx-category-search')).toHaveValue('');
    expect(screen.getByTestId('mf-tx-category-option-cat-1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-category-option-cat-3')).toBeInTheDocument();
  });

  it('limpa a seleção pela opção Nenhuma', () => {
    const { onChange } = renderSelect({ value: 'cat-1' });
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.click(screen.getByTestId('mf-tx-category-option-none'));
    // componente controlado: quem decide o novo label é o pai
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByTestId('mf-tx-category-panel')).not.toBeInTheDocument();
  });
});
