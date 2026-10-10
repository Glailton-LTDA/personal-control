import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCardInvoices, buildCardPaymentTx } from '../../hooks/useMinhasFinancas';

/**
 * Regras de pagamento de fatura (bug "marquei como paga e nada aconteceu"):
 * - pagamento VINCULADO (invoice_close) cai direto na fatura certa — inclusive
 *   na corrente, mesmo com data futura (agendada no vencimento);
 * - pagamento sem vínculo (histórico migrado) segue o FIFO das fechadas;
 * - buildCardPaymentTx agenda no vencimento (PENDENTE) ou paga hoje (vencida).
 */
const card = {
  id: 'acc-card',
  linked_account_id: 'acc-1',
  name: 'Nubank',
  closing_day: 10,
  due_day: 20,
  currency: 'BRL',
};

const purchase = (over) => ({
  id: 'x',
  account_id: 'acc-card',
  type: 'DESPESA',
  status: 'PAGO',
  description: 'Compra',
  ...over,
});

const payment = (over) => ({
  id: 'p',
  account_id: 'acc-1',
  transfer_account_id: 'acc-card',
  type: 'TRANSFERENCIA',
  status: 'PAGO',
  description: 'Pagamento de fatura — Nubank',
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildCardInvoices — pagamento vinculado (invoice_close)', () => {
  it('reduz a fatura corrente mesmo com data futura (agendada no vencimento)', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-10-02', amount: 500 }),
        payment({
          id: 'p1',
          amount: 500,
          payment_date: '2026-10-20', // futuro: só chega no vencimento
          status: 'PENDENTE',
          invoice_close: '2026-10-10', // ciclo da fatura corrente
        }),
      ],
    });

    expect(current.total).toBe(500);
    expect(current.openAmount).toBe(0); // em aberto zera na hora do registro
    expect(current.status).toBe('PAGA');
  });

  it('pagamento parcial vinculado deixa o saldo na fatura corrente', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-10-02', amount: 500 }),
        payment({
          id: 'p1',
          amount: 200,
          payment_date: '2026-10-20',
          status: 'PENDENTE',
          invoice_close: '2026-10-10',
        }),
      ],
    });

    expect(current.openAmount).toBe(300);
    expect(current.status).toBe('CORRENTE');
  });

  it('paga a fatura fechada certa mesmo com dívida antiga não paga na janela', () => {
    const { invoices } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'old', payment_date: '2026-05-05', amount: 400 }), // fecha 10/05
        purchase({ id: 'sep', payment_date: '2026-09-05', amount: 800 }), // fecha 10/09
        payment({
          id: 'p1',
          amount: 800,
          payment_date: '2026-09-25',
          invoice_close: '2026-09-10', // vínculo direto com a fatura de setembro
        }),
      ],
    });

    const may = invoices.find((inv) => inv.closeISO === '2026-05-10');
    const sep = invoices.find((inv) => inv.closeISO === '2026-09-10');
    expect(may.status).toBe('VENCIDA'); // dívida antiga permanece (não foi paga)
    expect(may.openAmount).toBe(400);
    expect(sep.status).toBe('PAGA'); // o pagamento foi para a fatura certa
    expect(sep.openAmount).toBe(0);
  });

  it('sem vínculo mantém o FIFO histórico: paga da fechada mais antiga primeiro', () => {
    const { invoices } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'old', payment_date: '2026-05-05', amount: 400 }),
        purchase({ id: 'sep', payment_date: '2026-09-05', amount: 800 }),
        payment({ id: 'p1', amount: 400, payment_date: '2026-09-25' }),
      ],
    });

    const may = invoices.find((inv) => inv.closeISO === '2026-05-10');
    const sep = invoices.find((inv) => inv.closeISO === '2026-09-10');
    expect(may.status).toBe('PAGA'); // FIFO: antiga primeiro
    expect(sep.status).toBe('VENCIDA'); // ainda não paga (fora de ordem)
    expect(sep.openAmount).toBe(800);
  });

  it('saldo do FIFO que sobra das fechadas também reduz a fatura corrente', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-10-02', amount: 500 }),
        payment({ id: 'p1', amount: 700, payment_date: '2026-10-01' }), // sem vínculo
      ],
    });

    // Fechadas da janela estão zeradas → todo o FIFO cai na corrente.
    expect(current.openAmount).toBe(0);
    expect(current.status).toBe('PAGA');
  });
});

describe('buildCardPaymentTx — payload de pagamento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  it('vencimento futuro → PENDENTE agendada no vencimento, vinculada ao ciclo', () => {
    const payload = buildCardPaymentTx({
      userId: 'u1',
      card,
      description: 'Pagamento de fatura',
      invoice: { closeISO: '2026-10-10', dueISO: '2026-10-20', openAmount: 1700 },
    });

    expect(payload).toMatchObject({
      user_id: 'u1',
      type: 'TRANSFERENCIA',
      account_id: 'acc-1',
      transfer_account_id: 'acc-card',
      description: 'Pagamento de fatura — Nubank',
      amount: 1700,
      status: 'PENDENTE',
      payment_date: '2026-10-20',
      invoice_close: '2026-10-10',
    });
  });

  it('vencimento já passado → PAGO hoje', () => {
    const payload = buildCardPaymentTx({
      userId: 'u1',
      card,
      description: 'Pagamento de fatura',
      invoice: { closeISO: '2026-09-10', dueISO: '2026-09-20', openAmount: 800 },
    });

    expect(payload).toMatchObject({
      amount: 800,
      status: 'PAGO',
      payment_date: '2026-10-04',
      invoice_close: '2026-09-10',
    });
  });

  it('aceita pagamento parcial e limita ao em aberto', () => {
    const invoice = { closeISO: '2026-10-10', dueISO: '2026-10-20', openAmount: 1000 };

    expect(
      buildCardPaymentTx({ userId: 'u1', card, description: 'P', invoice, amount: 250 })
    ).toMatchObject({ amount: 250 });

    // acima do em aberto → corta no limite da fatura
    expect(
      buildCardPaymentTx({ userId: 'u1', card, description: 'P', invoice, amount: 5000 })
    ).toMatchObject({ amount: 1000 });
  });

  it('retorna null sem valor em aberto ou com valor inválido', () => {
    const base = { userId: 'u1', card, description: 'P' };
    expect(
      buildCardPaymentTx({ ...base, invoice: { closeISO: '2026-10-10', openAmount: 0 } })
    ).toBeNull();
    expect(
      buildCardPaymentTx({
        ...base,
        invoice: { closeISO: '2026-10-10', openAmount: 100 },
        amount: 0,
      })
    ).toBeNull();
    expect(
      buildCardPaymentTx({
        ...base,
        invoice: { closeISO: '2026-10-10', openAmount: 100 },
        amount: 'abc',
      })
    ).toBeNull();
  });
});

describe('buildCardInvoices — régua de época em mês passado (feedback 07/10)', () => {
  it('vinculado a ciclo futuro não abate a fatura corrente do mês passado', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2021-03-31',
      monthKey: '2021-03',
      transactions: [
        purchase({ id: 'c1', payment_date: '2021-03-15', amount: 500 }),
        // registrado em out/2026 para a fatura que fecha em 10/04/21: à época
        // esse ciclo ainda estava aberto — não pode abater março
        payment({ id: 'p1', amount: 500, payment_date: '2026-10-06', invoice_close: '2021-04-10' }),
      ],
    });

    expect(current.total).toBe(500);
    expect(current.openAmount).toBe(500);
  });

  it('vinculado ao ciclo já fechado conta mesmo registrado anos depois', () => {
    const { invoices } = buildCardInvoices({
      card,
      refISO: '2021-03-31',
      monthKey: '2021-03',
      transactions: [
        purchase({ id: 'c1', payment_date: '2021-03-05', amount: 800 }),
        // registrado em out/2026 para a fatura que fechou em 10/03/21
        payment({ id: 'p1', amount: 800, payment_date: '2026-10-06', invoice_close: '2021-03-10' }),
      ],
    });

    const mar = invoices.find((inv) => inv.closeISO === '2021-03-10');
    expect(mar.total).toBe(800);
    expect(mar.openAmount).toBe(0);
    expect(mar.status).toBe('PAGA');
  });

  it('sem monthKey mantém a régua do mês vivo (compatibilidade)', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-10-02', amount: 500 }),
        payment({
          id: 'p1',
          amount: 500,
          payment_date: '2026-10-20',
          status: 'PENDENTE',
          invoice_close: '2026-10-10',
        }),
      ],
    });

    expect(current.openAmount).toBe(0);
  });

  it('expõe estornos e pago por fatura (bloco Fatura/Estornos/Pagamentos)', () => {
    const { invoices } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-09-05', amount: 800 }),
        purchase({ id: 'c2', payment_date: '2026-09-06', amount: -20, description: 'Estorno' }),
        payment({ id: 'p1', amount: 300, payment_date: '2026-09-25', invoice_close: '2026-09-10' }),
      ],
    });

    const sep = invoices.find((inv) => inv.closeISO === '2026-09-10');
    expect(sep.total).toBe(780);
    expect(sep.refunds).toBe(20);
    expect(sep.paid).toBe(300);
    expect(sep.openAmount).toBe(480);
  });

  it('FIFO percorre o histórico inteiro sem usar pagamento antigo para quitar a corrente', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        // Ciclo de jan/2025 (fora das seis faturas exibidas) quitado no vencimento.
        purchase({ id: 'old', payment_date: '2025-01-05', amount: 100 }),
        payment({ id: 'old-pay', payment_date: '2025-01-20', amount: 100 }),
        // Compra corrente sem pagamento: não pode ser marcada Paga pelo resto
        // de FIFO que a janela curta deixava sobrar.
        purchase({ id: 'current', payment_date: '2026-10-02', amount: 50 }),
      ],
    });

    expect(current.total).toBe(50);
    expect(current.openAmount).toBe(50);
    expect(current.status).toBe('CORRENTE');
  });

  it('carrega excedente de pagamento vinculado para a fatura seguinte', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-10-06',
      transactions: [
        purchase({ id: 'closed', payment_date: '2026-09-05', amount: 100 }),
        payment({
          id: 'overpay',
          amount: 150,
          payment_date: '2026-09-20',
          invoice_close: '2026-09-10',
        }),
        purchase({ id: 'current', payment_date: '2026-09-25', amount: 100 }),
      ],
    });

    // Os primeiros 100 quitam a fatura fechada; os 50 excedentes reduzem
    // a corrente, em vez de desaparecerem do cálculo.
    expect(current.total).toBe(100);
    expect(current.paid).toBe(50);
    expect(current.openAmount).toBe(50);
  });

  it('pagamento no fechamento do mês quita a fatura corrente mesmo antes do ciclo fechar', () => {
    const { current } = buildCardInvoices({
      card,
      refISO: '2026-09-30',
      monthKey: '2026-09',
      transactions: [
        purchase({ id: 'sep', payment_date: '2026-09-25', amount: 311.76 }),
        // Backfill mensal: mês quitado no fechamento (30/09), embora o
        // próximo ciclo feche em 10/10 e vença em 20/10.
        payment({ id: 'sep-pay', payment_date: '2026-09-30', amount: 311.76 }),
      ],
    });

    expect(current.total).toBe(311.76);
    expect(current.openAmount).toBe(0);
    expect(current.status).toBe('PAGA');
  });
});
