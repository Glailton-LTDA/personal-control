import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFCalculator from './MFCalculator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

const setup = () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<MFCalculator onConfirm={onConfirm} onClose={onClose} />);
  return { onConfirm, onClose };
};

describe('MFCalculator — tecla =', () => {
  it('calcula sem fechar e o check confirma o resultado', () => {
    const { onConfirm, onClose } = setup();

    fireEvent.click(screen.getByTestId('mf-calc-9'));
    fireEvent.click(screen.getByTestId('mf-calc-op-mul'));
    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-equals'));

    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('18');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('mf-calc-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('18,00');
  });

  it('continua a conta a partir do resultado do =', () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByTestId('mf-calc-9'));
    fireEvent.click(screen.getByTestId('mf-calc-op-mul'));
    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-equals'));
    fireEvent.click(screen.getByTestId('mf-calc-op-add'));
    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-equals'));

    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('20');

    fireEvent.click(screen.getByTestId('mf-calc-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('20,00');
  });

  it('dígito depois do = começa uma nova conta', () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByTestId('mf-calc-7'));
    fireEvent.click(screen.getByTestId('mf-calc-equals'));
    fireEvent.click(screen.getByTestId('mf-calc-5'));

    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('5');

    fireEvent.click(screen.getByTestId('mf-calc-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('5,00');
  });

  it('teclado físico opera e Enter confirma', () => {
    const { onConfirm } = setup();
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: '9' });
    fireEvent.keyDown(dialog, { key: '*' });
    fireEvent.keyDown(dialog, { key: '2' });
    fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledWith('18,00');
  });

  it('Backspace apaga e Esc limpa; Esc vazio fecha', () => {
    const { onClose } = setup();
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: '9' });
    fireEvent.keyDown(dialog, { key: '9' });
    fireEvent.keyDown(dialog, { key: 'Backspace' });
    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('9');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('0');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('insere o saldo da conta na expressão', () => {
    const onConfirm = vi.fn();
    render(
      <MFCalculator
        onConfirm={onConfirm}
        onClose={vi.fn()}
        balance={1000}
        balanceLabel="Nuconta"
      />
    );

    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-0'));
    fireEvent.click(screen.getByTestId('mf-calc-0'));
    fireEvent.click(screen.getByTestId('mf-calc-op-add'));
    fireEvent.click(screen.getByTestId('mf-calc-balance'));
    fireEvent.click(screen.getByTestId('mf-calc-equals'));

    expect(screen.getByTestId('mf-calc-display')).toHaveTextContent('1200');

    fireEvent.click(screen.getByTestId('mf-calc-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('1200,00');
  });

  it('abre com foco no diálogo e aria-modal', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(dialog);
  });
});
