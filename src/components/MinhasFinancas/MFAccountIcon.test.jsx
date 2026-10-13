import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import MFAccountIcon from './MFAccountIcon';
import { MF_BRAND_FILES } from './MFIconData';

describe('MFAccountIcon', () => {
  it('marca com logotipo oficial renderiza a imagem embutida em chip claro', () => {
    render(
      <MFAccountIcon account={{ icon: 'brand:nubank', name: 'Nubank' }} size={26} data-testid="icon" />
    );
    const box = screen.getByTestId('icon');
    const img = box.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('/mf-brands/nubank.svg');
    expect(box).toHaveStyle({ background: '#ffffff' });
  });

  it('marca Tesouro Direto usa o logotipo oficial embutido', () => {
    render(
      <MFAccountIcon
        account={{ icon: 'brand:tesourodireto', name: 'Tesouro Direto' }}
        data-testid="icon"
      />
    );
    const img = screen.getByTestId('icon').querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('/mf-brands/tesourodireto.svg');
  });

  it('todos os arquivos de marca apontam para SVGs existentes em public/mf-brands', () => {
    const missing = Object.values(MF_BRAND_FILES).filter(
      (file) => !fs.existsSync(`public/mf-brands/${file}`)
    );
    expect(missing).toEqual([]);
  });

  it('marca sem arquivo oficial cai no quadradinho embutido', () => {
    render(<MFAccountIcon account={{ icon: 'brand:will', name: 'Will Bank' }} data-testid="icon" />);
    const box = screen.getByTestId('icon');
    expect(box).toHaveTextContent('wi');
    expect(box.querySelector('img')).toBeNull();
  });

  it('glifo genérico usa o ícone lucide', () => {
    render(<MFAccountIcon account={{ icon: 'glyph:landmark', color: '#6366f1' }} data-testid="icon" />);
    // lucide é mockado no setup global como <div>
    expect(screen.getByTestId('icon').querySelector('div')).toBeInTheDocument();
  });

  it('glifo bolsa (gráfico de candles) para contas de bolsa de valores', () => {
    render(<MFAccountIcon account={{ icon: 'glyph:bolsa', color: '#10b981' }} data-testid="icon" />);
    expect(screen.getByTestId('icon').querySelector('div')).toBeInTheDocument();
  });

  it('sem ícone usa a inicial do nome com a cor da conta', () => {
    render(<MFAccountIcon account={{ name: 'Nuconta', color: '#820AD1' }} data-testid="icon" />);
    expect(screen.getByTestId('icon')).toHaveTextContent('N');
  });
});
