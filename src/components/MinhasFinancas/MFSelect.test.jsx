import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFSelect from './MFSelect';

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

describe('MFSelect (dropdown genérico do MinhasFinanças)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza cabeçalhos de grupo (optgroups) no popover', () => {
    render(
      <MFSelect
        testId="mf-generic"
        value="v1"
        onChange={() => {}}
        options={[
          { value: 'v1', label: 'Um', group: 'Padrões' },
          { value: 'v2', label: 'Dois', group: 'Padrões' },
          { value: 'v3', label: 'Três', group: 'Personalizados' },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId('mf-generic'));
    expect(screen.getByTestId('mf-generic-group-Padrões')).toBeInTheDocument();
    expect(screen.getByTestId('mf-generic-group-Personalizados')).toBeInTheDocument();
    expect(screen.getByTestId('mf-generic-option-v3')).toBeInTheDocument();
  });

  it('valores numéricos (mês/ano) chegam inteiros no onChange', () => {
    const onChange = vi.fn();
    render(
      <MFSelect
        testId="mf-generic"
        value={1}
        onChange={onChange}
        searchable={false}
        options={[
          { value: 1, label: 'Janeiro' },
          { value: 2, label: 'Fevereiro' },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId('mf-generic'));
    fireEvent.click(screen.getByTestId('mf-generic-option-2'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('abre o popover na opção selecionada (listas longas)', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      render(
        <MFSelect
          testId="mf-generic"
          value="v3"
          onChange={() => {}}
          searchable={false}
          options={[
            { value: 'v1', label: 'Um' },
            { value: 'v2', label: 'Dois' },
            { value: 'v3', label: 'Três' },
          ]}
        />
      );

      fireEvent.click(screen.getByTestId('mf-generic'));
      const selected = screen.getByTestId('mf-generic-option-v3');
      expect(selected).toHaveAttribute('aria-selected', 'true');
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      delete window.HTMLElement.prototype.scrollIntoView;
    }
  });

  it('desabilitado não abre o popover', () => {    render(
      <MFSelect
        testId="mf-generic"
        value=""
        onChange={() => {}}
        disabled
        searchable={false}
        options={[{ value: '', label: '—' }, { value: 'a', label: 'Algo' }]}
      />
    );

    const trigger = screen.getByTestId('mf-generic');
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('mf-generic-popover')).not.toBeInTheDocument();
  });

  it('busca filtra por label e meta (moeda)', () => {
    render(
      <MFSelect
        testId="mf-generic"
        value=""
        onChange={() => {}}
        options={[
          { value: 'a', label: 'Nubank', meta: '(BRL)' },
          { value: 'b', label: 'Conta', meta: '(USD)' },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId('mf-generic'));
    fireEvent.change(screen.getByTestId('mf-generic-search'), {
      target: { value: 'usd' },
    });
    expect(screen.getByTestId('mf-generic-option-b')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-generic-option-a')).not.toBeInTheDocument();
  });

  it('mostra o emptyLabel quando a busca não encontra nada', () => {
    render(
      <MFSelect
        testId="mf-generic"
        value=""
        onChange={() => {}}
        emptyLabel="Nada aqui"
        options={[{ value: 'a', label: 'Nubank' }]}
      />
    );

    fireEvent.click(screen.getByTestId('mf-generic'));
    fireEvent.change(screen.getByTestId('mf-generic-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('mf-generic-none')).toHaveTextContent('Nada aqui');
  });
});
