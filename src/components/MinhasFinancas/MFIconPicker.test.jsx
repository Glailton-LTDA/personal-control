import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFIconPicker from './MFIconPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

describe('MFIconPicker — famílias e busca', () => {
  it('agrupa os glifos por família quando não há busca', () => {
    render(<MFIconPicker icon={null} onChange={() => {}} testIdPrefix="mf-icon" />);

    expect(screen.getByTestId('mf-icon-glyph-family-finance')).toHaveTextContent(
      'minhasfinancas.icon_family_finance'
    );
    expect(screen.getByTestId('mf-icon-glyph-family-home')).toHaveTextContent(
      'minhasfinancas.icon_family_home'
    );
    expect(screen.getByTestId('mf-icon-glyph-family-people')).toBeInTheDocument();
    expect(screen.getByTestId('mf-icon-glyph-wallet')).toBeInTheDocument();
    expect(screen.getByTestId('mf-icon-glyph-home')).toBeInTheDocument();
  });

  it('na busca mostra os glifos encontrados sem os cabeçalhos de família', () => {
    render(<MFIconPicker icon={null} onChange={() => {}} testIdPrefix="mf-icon" />);

    fireEvent.change(screen.getByTestId('mf-icon-icon-search'), {
      target: { value: 'casa' },
    });

    expect(screen.getByTestId('mf-icon-glyph-home')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-icon-glyph-family-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-icon-glyph-wallet')).not.toBeInTheDocument();
  });

  it('escolher um glifo devolve glyph:<chave>', () => {
    const onChange = vi.fn();
    render(<MFIconPicker icon={null} onChange={onChange} testIdPrefix="mf-icon" />);
    fireEvent.click(screen.getByTestId('mf-icon-glyph-card'));
    expect(onChange).toHaveBeenCalledWith('glyph:card');
  });
});
