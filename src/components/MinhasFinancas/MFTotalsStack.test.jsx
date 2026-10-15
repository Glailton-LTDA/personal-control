import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFTotalsStack from './MFTotalsStack';

// Mock react-i18next (não usado aqui, mas o módulo importa formatMoney do hook)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

describe('MFTotalsStack — uma moeda por linha', () => {
  it('ordena BRL primeiro e empilha as linhas', () => {
    render(<MFTotalsStack totals={{ USD: 200, BRL: 1000, EUR: -313.7 }} testId="mf-stack" />);

    const lines = screen
      .getByTestId('mf-stack')
      .querySelectorAll('[data-testid^="mf-stack-line-"]');
    expect([...lines].map((el) => el.getAttribute('data-testid'))).toEqual([
      'mf-stack-line-BRL',
      'mf-stack-line-EUR',
      'mf-stack-line-USD',
    ]);
    expect(screen.getByTestId('mf-stack-line-EUR')).toHaveTextContent('-€');
  });

  it('prefixo e valores ocultos', () => {
    render(<MFTotalsStack totals={{ BRL: 100 }} prefix="+" testId="mf-stack-pre" />);
    expect(screen.getByTestId('mf-stack-pre-line-BRL')).toHaveTextContent('+');

    render(<MFTotalsStack totals={{ BRL: 100 }} showValues={false} />);
    expect(screen.getByText('•••')).toBeInTheDocument();
  });
});
