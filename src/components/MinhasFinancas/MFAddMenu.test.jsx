import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFAddMenu from './MFAddMenu';
import { MF_ADD_FAB } from './mfAddMenuData';

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

describe('MFAddMenu — menu "+" do módulo Minhas Finanças', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre o menu com as 4 opções e fecha ao escolher uma', () => {
    const onSelect = vi.fn();
    render(<MFAddMenu onSelect={onSelect} triggerTestId="mf-add" testId="mf-add-menu" />);

    fireEvent.click(screen.getByTestId('mf-add'));
    expect(screen.getByTestId('mf-add-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-expense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-cardExpense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-income')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-transfer')).toBeInTheDocument();
    // Fora do menu completo (só existe no detalhe do cartão)
    expect(screen.queryByTestId('mf-add-opt-estorno')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-add-opt-income'));
    expect(onSelect).toHaveBeenCalledWith('income');
    expect(screen.queryByTestId('mf-add-menu')).not.toBeInTheDocument();
  });

  it('itens do FAB do módulo incluem "Nova conta" antes das opções de lançamento', () => {
    const onSelect = vi.fn();
    render(
      <MFAddMenu
        items={MF_ADD_FAB}
        onSelect={onSelect}
        triggerTestId="mf-fab-add"
        testId="mf-fab-menu"
      />
    );

    fireEvent.click(screen.getByTestId('mf-fab-add'));
    expect(screen.getByTestId('mf-add-opt-account')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-expense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-transfer')).toBeInTheDocument();
    // "Nova conta" é exclusiva do FAB (o botão da tela de Lançamentos não tem)
    expect(MF_ADD_FAB[0]).toBe('account');

    fireEvent.click(screen.getByTestId('mf-add-opt-account'));
    expect(onSelect).toHaveBeenCalledWith('account');
  });

  it('respeita os itens contextuais (detalhe do cartão: 2 opções)', () => {
    render(
      <MFAddMenu
        items={['cardExpense', 'estorno']}
        onSelect={() => {}}
        triggerTestId="mf-add"
        testId="mf-add-menu"
      />
    );

    fireEvent.click(screen.getByTestId('mf-add'));
    expect(screen.getByTestId('mf-add-opt-cardExpense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-estorno')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-expense')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-transfer')).not.toBeInTheDocument();
  });

  it('fecha com Escape e com clique fora', () => {
    render(<MFAddMenu onSelect={() => {}} triggerTestId="mf-add" testId="mf-add-menu" />);

    fireEvent.click(screen.getByTestId('mf-add'));
    expect(screen.getByTestId('mf-add-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mf-add-menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-add'));
    expect(screen.getByTestId('mf-add-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('mf-add-menu')).not.toBeInTheDocument();
  });

  it('modo botão mostra rótulo; modo FAB é só o ícone com aria-label', () => {
    const { rerender } = render(
      <MFAddMenu label="minhasfinancas.tx_new" triggerTestId="mf-add" />
    );
    expect(screen.getByTestId('mf-add')).toHaveTextContent('minhasfinancas.tx_new');

    rerender(<MFAddMenu variant="fab" triggerTestId="mf-fab-add" testId="mf-add-menu" />);
    const fab = screen.getByTestId('mf-fab-add');
    expect(fab).toHaveAttribute('aria-label', 'minhasfinancas.tx_new');
    expect(fab).not.toHaveTextContent('minhasfinancas.tx_new');
  });

  it('modo FAB abre o menu centralizado na tela', () => {
    render(
      <MFAddMenu variant="fab" onSelect={() => {}} triggerTestId="mf-fab-add" testId="mf-fab-menu" />
    );

    fireEvent.click(screen.getByTestId('mf-fab-add'));
    expect(screen.getByTestId('mf-fab-menu')).toHaveStyle({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    });
  });
});
