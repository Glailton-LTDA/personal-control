import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFCurrencySelect from './MFCurrencySelect';
import MFCurrencyFilter from './MFCurrencyFilter';

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

describe('MFCurrencySelect (seletor com bandeiras)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre o popover com bandeira, código e nome de cada moeda', () => {
    render(<MFCurrencySelect value="BRL" onChange={() => {}} />);

    fireEvent.click(screen.getByTestId('mf-currency-select'));

    expect(screen.getByTestId('mf-currency-popover')).toBeInTheDocument();

    const brl = screen.getByTestId('mf-currency-option-BRL');
    expect(brl).toHaveTextContent('🇧🇷');
    expect(brl).toHaveTextContent('BRL');
    expect(brl).toHaveAttribute('aria-selected', 'true');

    const usd = screen.getByTestId('mf-currency-option-USD');
    expect(usd).toHaveTextContent('🇺🇸');
    expect(usd).toHaveTextContent('USD');
    expect(usd).toHaveAttribute('aria-selected', 'false');

    const eur = screen.getByTestId('mf-currency-option-EUR');
    expect(eur).toHaveTextContent('🇪🇺');
  });

  it('filtra por código ou nome e seleciona a moeda', () => {
    const onChange = vi.fn();
    render(<MFCurrencySelect value="BRL" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mf-currency-select'));
    fireEvent.change(screen.getByTestId('mf-currency-search'), {
      target: { value: 'euro' },
    });

    expect(screen.getByTestId('mf-currency-option-EUR')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-currency-option-USD')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-currency-option-EUR'));
    expect(onChange).toHaveBeenCalledWith('EUR');
    // Fecha ao escolher
    expect(screen.queryByTestId('mf-currency-popover')).not.toBeInTheDocument();
  });

  it('mostra mensagem quando a busca não encontra moeda', () => {
    render(<MFCurrencySelect value="BRL" onChange={() => {}} />);

    fireEvent.click(screen.getByTestId('mf-currency-select'));
    fireEvent.change(screen.getByTestId('mf-currency-search'), {
      target: { value: 'zzzz' },
    });

    expect(screen.getByTestId('mf-currency-empty')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.currency_none')).toBeInTheDocument();
  });

  it('popover é montado no body (fora do glass-card que prende o stacking)', () => {
    render(
      <div className="glass-card">
        <MFCurrencySelect value="BRL" onChange={() => {}} />
      </div>
    );

    fireEvent.click(screen.getByTestId('mf-currency-select'));

    const popover = screen.getByTestId('mf-currency-popover');
    // Portal direto no body: dentro da glass-card o backdrop-filter cria
    // stacking context e o conteúdo irmão (KPIs) tapava o popover.
    expect(popover.parentElement).toBe(document.body);
    expect(popover.style.position).toBe('fixed');
  });

  it('filtro por tela inclui a opção "todas as moedas" e reflete a seleção', () => {
    const onChange = vi.fn();

    function ControlledFilter() {
      const [value, setValue] = React.useState('all');
      return (
        <MFCurrencyFilter
          currencies={['BRL', 'USD']}
          value={value}
          onChange={(code) => {
            onChange(code);
            setValue(code);
          }}
        />
      );
    }

    render(<ControlledFilter />);

    const trigger = screen.getByTestId('mf-currency-filter');
    expect(trigger).toHaveTextContent('minhasfinancas.currency_all');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('mf-currency-option-all'));
    expect(onChange).toHaveBeenLastCalledWith('all');

    fireEvent.click(screen.getByTestId('mf-currency-filter'));
    fireEvent.click(screen.getByTestId('mf-currency-option-USD'));
    expect(onChange).toHaveBeenLastCalledWith('USD');
    expect(screen.getByTestId('mf-currency-filter')).toHaveTextContent('🇺🇸');
    expect(screen.getByTestId('mf-currency-filter')).toHaveTextContent('USD');
  });
});
