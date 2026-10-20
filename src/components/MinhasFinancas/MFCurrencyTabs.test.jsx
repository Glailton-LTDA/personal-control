import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFCurrencyTabs from './MFCurrencyTabs';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

describe('MFCurrencyTabs — abas por moeda', () => {
  it('ordena BRL primeiro e marca a aba ativa', () => {
    const onChange = vi.fn();
    render(
      <MFCurrencyTabs
        currencies={['USD', 'BRL', 'EUR']}
        counts={{ BRL: 10, USD: 2, EUR: 1 }}
        value="BRL"
        onChange={onChange}
      />
    );

    const tabs = screen.getByTestId('mf-currency-tabs');
    const order = [...tabs.querySelectorAll('[role="tab"]')].map((el) =>
      el.getAttribute('data-testid')
    );
    expect(order).toEqual([
      'mf-currency-tabs-all',
      'mf-currency-tabs-BRL',
      'mf-currency-tabs-EUR',
      'mf-currency-tabs-USD',
    ]);
    expect(screen.getByTestId('mf-currency-tabs-BRL')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('mf-currency-tabs-BRL')).toHaveTextContent('10');
  });

  it('clicar troca a moeda', () => {
    const onChange = vi.fn();
    render(
      <MFCurrencyTabs currencies={['BRL', 'USD']} value="all" onChange={onChange} />
    );

    fireEvent.click(screen.getByTestId('mf-currency-tabs-USD'));
    expect(onChange).toHaveBeenCalledWith('USD');
    fireEvent.click(screen.getByTestId('mf-currency-tabs-all'));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('no estreito vira botão + bottom-sheet (sem abas que vazem da tela)', () => {
    // Mobile: régua de abas gerava rolagem lateral — vira menu de baixo
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    try {
      const onChange = vi.fn();
      render(
        <MFCurrencyTabs
          currencies={['BRL', 'USD']}
          value="all"
          onChange={onChange}
        />
      );
      // sem a régua de abas: só o botão com a moeda ativa
      expect(screen.queryByTestId('mf-currency-tabs')).not.toBeInTheDocument();
      const menu = screen.getByTestId('mf-currency-tabs-menu');
      expect(menu).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(menu);
      expect(screen.getByTestId('mf-currency-tabs-sheet')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('mf-currency-tabs-USD'));
      expect(onChange).toHaveBeenCalledWith('USD');
      // escolher fecha o sheet
      expect(screen.queryByTestId('mf-currency-tabs-sheet')).not.toBeInTheDocument();
    } finally {
      delete window.matchMedia;
    }
  });
});
