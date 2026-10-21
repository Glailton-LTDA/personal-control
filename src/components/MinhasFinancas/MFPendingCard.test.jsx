import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-i18next (o t() devolve a própria chave — o texto é pt fixo)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

// Dados do mês: a fatura agendada (espelho do cartão) + uma despesa + uma
// receita + uma transferência.
const PENDING = [
  {
    id: 'tx-fatura',
    type: 'DESPESA',
    amount: 1609.15,
    description: 'Pagamento de fatura — Itaú',
    payment_date: '2026-10-22',
    status: 'PENDENTE',
    account_id: 'acc-itaú',
    invoice_close: '2026-10-15',
  },
  {
    id: 'tx-despesa',
    type: 'DESPESA',
    amount: 99.9,
    description: 'Pagamento Internet',
    payment_date: '2026-10-01',
    status: 'PENDENTE',
    account_id: 'acc-itaú',
    invoice_close: null,
  },
  {
    id: 'tx-receita',
    type: 'RECEITA',
    amount: 500,
    description: 'Salário',
    payment_date: '2026-10-05',
    status: 'PENDENTE',
    account_id: 'acc-nu',
    invoice_close: null,
  },
  {
    id: 'tx-transf',
    type: 'TRANSFERENCIA',
    amount: 300,
    description: 'Transferência Nubank',
    payment_date: '2026-10-10',
    status: 'PENDENTE',
    account_id: 'acc-nu',
    invoice_close: null,
  },
];

const ACCOUNTS = [
  { id: 'acc-itaú', name: 'Itaú', currency: 'BRL', account_type: 'CORRENTE' },
  { id: 'acc-nu', name: 'Nuconta', currency: 'BRL', account_type: 'CORRENTE' },
];

let rows = [];

vi.mock('../../hooks/useMinhasFinancas', () => ({
  formatMoney: (value) => `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`,
  useMFPendingMonth: () => ({ data: rows }),
  useMFAccounts: () => ({ data: ACCOUNTS }),
}));

import MFPendingCard from './MFPendingCard';

const renderCard = (props = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFPendingCard user={{ id: 'u1' }} monthKey="2026-10" {...props} />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  rows = [...PENDING];
});

describe('MFPendingCard — pendentes do mês no Resumo', () => {
  it('mini-totais: a pagar, a receber e transferir', () => {
    renderCard();
    expect(screen.getByTestId('mf-resumo-pending-count')).toHaveTextContent('4');
    expect(screen.getByTestId('mf-resumo-pending-stat-pay')).toHaveTextContent('R$ 1709,05');
    expect(screen.getByTestId('mf-resumo-pending-stat-recv')).toHaveTextContent('R$ 500,00');
    expect(screen.getByTestId('mf-resumo-pending-stat-trans')).toHaveTextContent('R$ 300,00');
  });

  it('zero em cinza neutro (sem cor de sinal)', () => {
    rows = [];
    renderCard();
    const stat = screen.getByTestId('mf-resumo-pending-stat-pay');
    expect(stat).toHaveTextContent('R$ 0,00');
    // jsdom não resolve var() no CSSOM — o atributo mantém o texto.
    const value = stat.querySelector('span:last-child');
    expect(value.getAttribute('style')).toContain('var(--text-muted)');
    expect(value.getAttribute('style')).not.toContain('#ef4444');
  });

  it('pílulas filtram por tipo', () => {
    renderCard();
    expect(screen.getByTestId('mf-resumo-pending-pill-all')).toHaveTextContent('(4)');
    expect(screen.getByTestId('mf-resumo-pending-pill-despesa')).toHaveTextContent('(2)');
    expect(screen.getByTestId('mf-resumo-pending-pill-receita')).toHaveTextContent('(1)');
    expect(screen.getByTestId('mf-resumo-pending-pill-transferencia')).toHaveTextContent('(1)');

    fireEvent.click(screen.getByTestId('mf-resumo-pending-pill-receita'));
    expect(screen.getByTestId('mf-resumo-pending-item-tx-receita')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-resumo-pending-item-tx-despesa')).not.toBeInTheDocument();
  });

  it('fatura agendada entra marcada (🎴) e o clique abre o detalhe', () => {
    const onOpenTx = vi.fn();
    renderCard({ onOpenTx });
    const fatura = screen.getByTestId('mf-resumo-pending-fatura-tx-fatura');
    expect(fatura.textContent).toContain('🎴');
    expect(fatura.textContent).toContain('15/10');
    // vencimento em badge próprio
    expect(screen.getByTestId('mf-resumo-pending-item-tx-fatura').textContent).toContain('22/10');

    fireEvent.click(screen.getByTestId('mf-resumo-pending-item-tx-fatura'));
    expect(onOpenTx).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-fatura' }));
  });

  it('sem pendentes no mês mostra o estado vazio', () => {
    rows = [];
    renderCard();
    expect(screen.getByTestId('mf-resumo-pending-empty')).toBeInTheDocument();
    expect(screen.getByTestId('mf-resumo-pending-count')).toHaveTextContent('0');
  });

  it('filtro sem resultado mostra a mensagem própria', () => {
    rows = [PENDING[0]]; // só a fatura: o filtro "Receber" fica vazio
    renderCard();
    fireEvent.click(screen.getByTestId('mf-resumo-pending-pill-receita'));
    expect(screen.getByTestId('mf-resumo-pending-empty-filter')).toBeInTheDocument();
  });
});
