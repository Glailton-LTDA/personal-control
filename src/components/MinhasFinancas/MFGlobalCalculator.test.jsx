import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFGlobalCalculator from './MFGlobalCalculator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMFAccountBalances: () => ({ data: { 'acc-1': 1000, 'acc-2': 500 } }),
  };
});

const accounts = [
  {
    id: 'acc-1',
    name: 'Nuconta',
    currency: 'BRL',
    account_type: 'CORRENTE',
    archived_at: null,
  },
  {
    id: 'acc-2',
    name: 'C6',
    currency: 'BRL',
    account_type: 'CORRENTE',
    archived_at: null,
  },
];

describe('MFGlobalCalculator', () => {
  it('abre pelo botão global e insere o saldo da conta escolhida', async () => {
    render(<MFGlobalCalculator user={{ id: 'u' }} accounts={accounts} />);

    fireEvent.click(screen.getByTestId('mf-global-calc-open'));
    expect(screen.getByTestId('mf-global-calc')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('mf-calc-account')).toHaveValue('acc-1');
    });

    fireEvent.click(screen.getByTestId('mf-calc-balance'));
    expect(screen.getByTestId('mf-global-calc-display')).toHaveTextContent('1000');

    fireEvent.change(screen.getByTestId('mf-calc-account'), {
      target: { value: 'acc-2' },
    });
    fireEvent.click(screen.getByTestId('mf-calc-balance'));
    expect(screen.getByTestId('mf-global-calc-display')).toHaveTextContent('500');
  });
});
