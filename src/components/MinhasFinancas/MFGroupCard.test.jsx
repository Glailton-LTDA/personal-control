import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFGroupCard from './MFGroupCard';

describe('MFGroupCard', () => {
  it('renderiza avatar, nome com tooltip, subtítulo numa linha e total', () => {
    const onOpen = vi.fn();
    render(
      <MFGroupCard
        icon="🏦"
        name="Banco do Brasil com nome bem longo para truncar"
        subtitle="2 contas · 1 grupo"
        total="R$ 2.551,69"
        onOpen={onOpen}
        testId="mf-group-card-x"
      />
    );

    const card = screen.getByTestId('mf-group-card-x');
    expect(card).toHaveTextContent('Banco do Brasil com nome bem longo para truncar');
    // tooltip com o nome completo (visível no hover quando truncado)
    expect(card).toHaveAttribute('title', 'Banco do Brasil com nome bem longo para truncar');
    expect(card).toHaveTextContent('2 contas · 1 grupo');
    expect(card).toHaveTextContent('R$ 2.551,69');

    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('sem total mostra o trailing (ex.: seta) e sem subtítulo não quebra', () => {
    render(
      <MFGroupCard
        icon="🍔"
        name="Alimentação"
        subtitle=""
        total={null}
        trailing={<span data-testid="mf-trailing">→</span>}
        onOpen={() => {}}
        testId="mf-group-card-y"
      />
    );

    expect(screen.getByTestId('mf-trailing')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-card-y')).toHaveTextContent('Alimentação');
  });
});
