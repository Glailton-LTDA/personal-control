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

  it('signColors: cada moeda pela cor do seu sinal (transferências líquidas)', () => {
    render(
      <MFTotalsStack
        totals={{ BRL: 300, USD: -120, EUR: 0 }}
        signColors
        testId="mf-stack-sinal"
      />
    );
    // jsdom não resolve var() no CSSOM — o atributo mantém o texto.
    const cor = (code) =>
      screen.getByTestId(`mf-stack-sinal-line-${code}`).getAttribute('style') ?? '';
    expect(cor('BRL')).toContain('var(--success');
    expect(cor('USD')).toContain('var(--danger');
    expect(cor('EUR')).toContain('var(--text-muted)');
  });

  it('não desenha bandeiras — só a sigla do formatMoney (pedido do usuário)', () => {
    render(<MFTotalsStack totals={{ BRL: 10, USD: 5 }} testId="mf-sigla" />);
    const usd = screen.getByTestId('mf-sigla-line-USD').textContent;
    expect(usd).toContain('US$');
    expect(usd).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('hero: primeira moeda em destaque e as demais menores e discretas', () => {
    render(<MFTotalsStack totals={{ BRL: 1000, USD: 200 }} hero testId="mf-hero" />);
    const brl = screen.getByTestId('mf-hero-line-BRL');
    const usd = screen.getByTestId('mf-hero-line-USD');
    // R$ grande e forte; US$ menor e apagado (formato do mock de referência)
    expect(brl.style.fontWeight).toBe('800');
    expect(usd.style.fontSize).toBe('0.66em');
    expect(usd.style.color).toBe('var(--text-muted)');
  });

  it('mutedNegative: valores na cor do rótulo e vermelhos quando negativos', () => {
    render(<MFTotalsStack totals={{ BRL: 150, USD: -20 }} mutedNegative testId="mf-muted" />);
    expect(screen.getByTestId('mf-muted-line-BRL').style.color).toBe('var(--text-muted)');
    expect(screen.getByTestId('mf-muted-line-USD').style.color).toBe('var(--danger)');
  });

  it('redNegative: mantém a cor herdada e pinta de vermelho só os negativos', () => {
    render(<MFTotalsStack totals={{ BRL: 150, USD: -20 }} redNegative testId="mf-redneg" />);
    expect(screen.getByTestId('mf-redneg-line-BRL').style.color).toBe('');
    expect(screen.getByTestId('mf-redneg-line-USD').style.color).toBe('var(--danger)');
  });
});
