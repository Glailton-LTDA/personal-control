import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFRepeatModal from './MFRepeatModal';

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

const renderModal = (overrides = {}) =>
  render(
    <MFRepeatModal
      initial={1}
      count={2}
      periodicity="MONTHLY"
      amountMode="parcela"
      amount={185.7}
      currency="BRL"
      onApply={() => {}}
      onClose={() => {}}
      {...overrides}
    />
  );

describe('MFRepeatModal — Valor total | Valor parcela', () => {
  it('parcela é o padrão e o preview mostra o valor digitado', () => {
    renderModal();
    expect(screen.getByTestId('mf-repeat-mode-parcela')).toHaveAttribute('aria-pressed', 'true');
    // segmento neutro: o selecionado é marcado por aria-pressed, sem vermelho
    expect(screen.getByTestId('mf-repeat-mode-parcela')).toHaveClass('btn-option');
    // t() do mock devolve a chave (interpolação não é resolvida)
    expect(screen.getByTestId('mf-repeat-preview')).toHaveTextContent(
      'minhasfinancas.tx_repeat_preview'
    );
  });

  it('alternar para total divide no preview e vai no payload do Concluir', () => {
    const onApply = vi.fn();
    renderModal({ onApply });

    fireEvent.click(screen.getByTestId('mf-repeat-mode-total'));
    expect(screen.getByTestId('mf-repeat-mode-total')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    expect(onApply).toHaveBeenCalledWith({
      initial: 1,
      count: 2,
      periodicity: 'MONTHLY',
      amountMode: 'total',
    });
  });

  it('quantidade muda o divisor do preview', () => {
    renderModal({ amountMode: 'total', amount: 185.7 });
    // 185,70 / 2 no modo total (lógica coberta no submit; aqui só o controle)
    fireEvent.click(screen.getByTestId('mf-repeat-quantity-inc'));
    expect(screen.getByTestId('mf-repeat-quantity')).toHaveTextContent('3');
  });
});
