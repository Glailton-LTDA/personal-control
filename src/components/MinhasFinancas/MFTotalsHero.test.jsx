import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFTotalsHero from './MFTotalsHero';

// Mock react-i18next (formatMoney sai do hook real, que usa Intl pt-BR)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

describe('MFTotalsHero — KPI no formato do mock de referência', () => {
  it('BRL em destaque e as demais moedas como chips de sigla (sem bandeira)', () => {
    render(
      <MFTotalsHero totals={{ USD: 899.7, BRL: 125614.83, EUR: 86.3 }} testId="mf-hero" />
    );
    expect(screen.getByTestId('mf-hero-hero')).toHaveTextContent('R$ 125.614,83');
    const chip = screen.getByTestId('mf-hero-chip-USD');
    expect(chip).toHaveTextContent('US$ 899,70');
    // sigla limpa: nenhuma bandeira/emoji nos valores (pedido do usuário)
    expect(chip.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByTestId('mf-hero-chip-EUR')).toBeInTheDocument();
    // os chips são pequenos e apagados (destaque é só do R$)
    expect(chip.style.fontSize).toBe('0.72rem');
    expect(chip.style.color).toBe('var(--text-muted)');
  });

  it('sem BRL a primeira moeda vira o destaque; uma moeda só não mostra chips', () => {
    render(<MFTotalsHero totals={{ USD: 10 }} testId="mf-hero-1" />);
    expect(screen.getByTestId('mf-hero-1-hero')).toHaveTextContent('US$ 10,00');
    expect(screen.queryByTestId('mf-hero-1-chip-USD')).not.toBeInTheDocument();
  });

  it('valores ocultos e lista vazia', () => {
    render(<MFTotalsHero totals={{ BRL: 1 }} showValues={false} />);
    expect(screen.getByText('•••')).toBeInTheDocument();

    render(<MFTotalsHero totals={{}} />);
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
  });
});
