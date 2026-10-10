import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFAccountSelect from './MFAccountSelect';

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

const ACCOUNTS = [
  { id: 'acc-1', name: 'Nubank', currency: 'BRL', color: '#6366f1', sort_order: 0 },
  { id: 'acc-2', name: 'Banco do Brasil', currency: 'BRL', color: '#0ea5e9', sort_order: 1 },
  { id: 'acc-3', name: 'Conta USD', currency: 'USD', color: '#10b981', sort_order: 2 },
];

describe('MFAccountSelect (dropdown moderno de contas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre o popover com nome, moeda e a selecionada no gatilho', () => {
    render(
      <MFAccountSelect
        value="acc-1"
        onChange={() => {}}
        accounts={ACCOUNTS}
        placeholder="Selecione a conta"
        testId="mf-tx-account"
      />
    );

    expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Nubank');

    fireEvent.click(screen.getByTestId('mf-tx-account'));
    expect(screen.getByTestId('mf-tx-account-popover')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-account-option-acc-1')).toHaveTextContent('Nubank');
    expect(screen.getByTestId('mf-tx-account-option-acc-1')).toHaveTextContent('BRL');
    expect(screen.getByTestId('mf-tx-account-option-acc-3')).toHaveTextContent('USD');
  });

  it('busca filtra por nome e por moeda', () => {
    render(
      <MFAccountSelect value="" onChange={() => {}} accounts={ACCOUNTS} testId="mf-tx-account" />
    );

    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.change(screen.getByTestId('mf-tx-account-search'), {
      target: { value: 'brasil' },
    });
    expect(screen.getByTestId('mf-tx-account-option-acc-2')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-account-option-acc-1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-tx-account-search'), {
      target: { value: 'usd' },
    });
    expect(screen.getByTestId('mf-tx-account-option-acc-3')).toBeInTheDocument();
  });

  it('seleciona a conta, chama onChange e fecha o popover', () => {
    const onChange = vi.fn();
    render(
      <MFAccountSelect value="" onChange={onChange} accounts={ACCOUNTS} testId="mf-tx-account" />
    );

    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-2'));

    expect(onChange).toHaveBeenCalledWith('acc-2');
    expect(screen.queryByTestId('mf-tx-account-popover')).not.toBeInTheDocument();
  });

  it('mostra mensagem quando a busca não encontra conta', () => {
    render(
      <MFAccountSelect value="" onChange={() => {}} accounts={ACCOUNTS} testId="mf-tx-account" />
    );

    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.change(screen.getByTestId('mf-tx-account-search'), {
      target: { value: 'zzzz' },
    });

    expect(screen.getByTestId('mf-tx-account-none')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.account_no_results')).toBeInTheDocument();
  });

  it('placeholder aparece quando nada está selecionado', () => {
    render(
      <MFAccountSelect
        value=""
        onChange={() => {}}
        accounts={ACCOUNTS}
        placeholder="Selecione a conta"
        testId="mf-tx-account"
      />
    );

    expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Selecione a conta');
  });

  it('popover é montado no body (fora do glass-card que prende o stacking)', () => {
    render(
      <div className="glass-card">
        <MFAccountSelect value="" onChange={() => {}} accounts={ACCOUNTS} testId="mf-tx-account" />
      </div>
    );

    fireEvent.click(screen.getByTestId('mf-tx-account'));

    const popover = screen.getByTestId('mf-tx-account-popover');
    expect(popover.parentElement).toBe(document.body);
    expect(popover.style.position).toBe('fixed');
  });
});
