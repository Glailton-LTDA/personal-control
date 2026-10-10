import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFCardBrandIcon from './MFCardBrandIcon';

// Mock react-i18next (MFAccountIcon não usa, mas mantém o padrão dos testes MF)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

describe('MFCardBrandIcon (ícone da bandeira do cartão)', () => {
  it('marca do catálogo renderiza pelo sistema de ícones (logo oficial quando existe)', () => {
    render(<MFCardBrandIcon brand="visa" size={18} title="Visa" />);
    const icon = screen.getByTestId('mf-brand-icon-visa');
    expect(icon).toBeInTheDocument();
    // visa.svg registrado em MF_BRAND_FILES → chip claro com o logo
    expect(icon.querySelector('img')).toHaveAttribute('src', expect.stringContaining('mf-brands/visa.svg'));
  });

  it('marca com arquivo embutido exibe o logo oficial', () => {
    render(<MFCardBrandIcon brand="mastercard" size={18} />);
    const icon = screen.getByTestId('mf-brand-icon-mastercard');
    expect(icon.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('mf-brands/mastercard.svg')
    );
  });

  it('marca do catálogo sem arquivo usa o quadradinho (tile)', () => {
    render(<MFCardBrandIcon brand="iti" size={18} />);
    const icon = screen.getByTestId('mf-brand-icon-iti');
    expect(icon).toBeInTheDocument();
    expect(icon.querySelector('img')).toBeNull();
    expect(icon).toHaveTextContent('iti');
  });

  it('marca fora do catálogo (outro) cai no ícone genérico de cartão', () => {
    render(<MFCardBrandIcon brand="outro" size={18} />);
    expect(screen.getByTestId('mf-brand-fallback-outro')).toBeInTheDocument();
  });

  it('sem bandeira não renderiza nada', () => {
    const { container } = render(<MFCardBrandIcon brand={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
