import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCardInvoices, buildCardPaymentTx, cardCycles, invoiceCloseForDueMonth, planCardAnticipation, isParceladaTx } from '../../hooks/useMinhasFinancas';

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
      type: 'DESPESA',
      account_id: 'acc-1',
      description: 'Pagamento de fatura — Nubank',
      amount: 1700,
      status: 'PENDENTE',
      payment_date: '2026-10-20',
      invoice_close: '2026-10-10',
    });
    // Sem transação no cartão: só despesa na conta vinculada.
    expect(payload).not.toHaveProperty('transfer_account_id');
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
    const built = buildCardInvoices({
      card,
      refISO: '2021-03-31',
      monthKey: '2021-03',
      transactions: [
        purchase({ id: 'c1', payment_date: '2021-03-05', amount: 800 }),
        // registrado em out/2026 para a fatura que fechou em 10/03/21
        payment({ id: 'p1', amount: 800, payment_date: '2026-10-06', invoice_close: '2021-03-10' }),
      ],
    });

    // 2021-03-10 vence em março → é a corrente do mês (não aparece na
    // lista de fechadas).
    expect(built.current.closeISO).toBe('2021-03-10');
    expect(built.current.total).toBe(800);
    expect(built.current.openAmount).toBe(0);
    expect(built.current.status).toBe('PAGA');
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
    const built = buildCardInvoices({
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
        // Outubro (corrente): absorve os 50 excedentes de setembro.
        purchase({ id: 'current', payment_date: '2026-10-02', amount: 100 }),
      ],
    });

    // Setembro quitada (100/100); os 50 excedentes reduzem a corrente.
    const sep = built.invoices.find((inv) => inv.closeISO === '2026-09-10');
    expect(sep.total).toBe(100);
    expect(sep.openAmount).toBe(0);
    expect(built.current.total).toBe(100);
    expect(built.current.paid).toBe(50);
    expect(built.current.openAmount).toBe(50);
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

describe('buildCardInvoices — pagamento efetivado em mês passado (bug fatura paga aparece em aberto)', () => {
  // Cartão fecha dia 14, vence dia 20 (caso real): fatura paga em 20/08
  // (PAGO, vinculada ao ciclo que fecha em 14/09) tem que aparecer paga
  // ao navegar agosto — o dinheiro saiu em 20/08.
  const card14 = { ...card, closing_day: 14, due_day: 20 };

  it('PAGO vinculado conta no mês em que o dinheiro saiu', () => {
    const { current } = buildCardInvoices({
      card: card14,
      refISO: '2026-08-31',
      monthKey: '2026-08',
      transactions: [
        purchase({ id: 'aug', payment_date: '2026-08-20', amount: 311.76 }),
        payment({
          id: 'aug-pay',
          amount: 311.76,
          status: 'PAGO',
          payment_date: '2026-08-20',
          // Agosto vence 20/08 (fecha 14/08): o vínculo é na fatura do mês.
          invoice_close: '2026-08-14',
        }),
      ],
    });

    expect(current.total).toBe(311.76);
    expect(current.openAmount).toBe(0);
    expect(current.status).toBe('PAGA');
  });

  it('PENDENTE agendado para depois continua fora do mês passado', () => {
    const { current } = buildCardInvoices({
      card: card14,
      refISO: '2026-08-31',
      monthKey: '2026-08',
      transactions: [
        purchase({ id: 'aug', payment_date: '2026-08-20', amount: 311.76 }),
        // Agendado no vencimento (20/09), ainda não efetivado: à época
        // de agosto esse dinheiro não tinha saído.
        payment({
          id: 'aug-pay',
          amount: 311.76,
          status: 'PENDENTE',
          payment_date: '2026-09-20',
          invoice_close: '2026-09-14',
        }),
      ],
    });

    expect(current.total).toBe(311.76);
    expect(current.openAmount).toBe(311.76);
    expect(current.status).toBe('CORRENTE');
  });

  it('compra cai na fatura do mês do lançamento (fecha 14 → junho, não julho)', () => {
    const { current, invoices } = buildCardInvoices({
      card: card14,
      refISO: '2026-08-31',
      transactions: [
        // 16/06 é de junho (fatura que vence 20/06): a data nunca empurra
        // para o mês seguinte — a fatura é a do mês calendário.
        purchase({ id: 'jun', payment_date: '2026-06-16', amount: 11.49 }),
      ],
    });

    const june = invoices.find((inv) => inv.closeISO === '2026-06-14');
    const july = invoices.find((inv) => inv.closeISO === '2026-07-14');
    expect(june.total).toBe(11.49);
    expect(june.dueISO).toBe('2026-06-20');
    expect(july.total).toBe(0);
    expect(current.closeISO).toBe('2026-08-14');
  });
});

describe('buildCardInvoices — despesa com fatura escolhida (picker do app original)', () => {
  const card14 = {
    ...card,
    closing_day: 14,
    due_day: 20,
  };
  const expense = (over) => ({
    id: 'e',
    account_id: 'acc-card',
    type: 'DESPESA',
    status: 'PAGO',
    description: 'Compra',
    ...over,
  });

  it('vai direto para o ciclo escolhido, ignorando a data', () => {
    const built = buildCardInvoices({
      card: card14,
      refISO: '2026-10-11',
      transactions: [
        // 10/10 cairia na corrente (fecha 14/10); com vínculo vai para 11-14.
        expense({ id: 'e1', payment_date: '2026-10-10', amount: 100, invoice_close: '2026-11-14' }),
      ],
    });

    expect(built.current.total).toBe(0);
    expect(built.upcomingInvoices).toHaveLength(1);
    const up = built.upcomingInvoices[0];
    expect(up.closeISO).toBe('2026-11-14');
    expect(up.dueISO).toBe('2026-11-20');
    expect(up.total).toBe(100);
    expect(up.openAmount).toBe(100);
    expect(up.future).toBe(true);
    expect(up.status).toBe('EM_ABERTO');
  });

  it('futura vinculada entra no em aberto (limite comprometido)', () => {
    const built = buildCardInvoices({
      card: card14,
      refISO: '2026-10-11',
      transactions: [
        expense({ id: 'e1', payment_date: '2026-10-10', amount: 100, invoice_close: '2026-11-14' }),
      ],
    });

    expect(built.openTotal).toBe(100);
  });

  it('pagamento vinculado quita a futura', () => {
    const built = buildCardInvoices({
      card: card14,
      refISO: '2026-10-11',
      transactions: [
        expense({ id: 'e1', payment_date: '2026-10-10', amount: 100, invoice_close: '2026-11-14' }),
        payment({ id: 'p1', amount: 100, payment_date: '2026-10-11', invoice_close: '2026-11-14' }),
      ],
    });

    expect(built.upcomingInvoices[0].openAmount).toBe(0);
    expect(built.upcomingInvoices[0].status).toBe('PAGA');
    expect(built.openTotal).toBe(0);
  });

  it('PENDENTE conta na fatura (limite cai independente de status)', () => {
    const { current } = buildCardInvoices({
      card: card14,
      refISO: '2026-10-11',
      transactions: [
        purchase({ id: 'c1', payment_date: '2026-10-02', amount: 500, status: 'PENDENTE' }),
      ],
    });

    expect(current.total).toBe(500);
    expect(current.openAmount).toBe(500);
  });

  it('vinculada com data futura no mês entra na fatura do mês vivo', () => {
    // Parcela de 28/10 vinculada a outubro: aparece na corrente de
    // outubro (mês vivo) sem vazar para meses anteriores.
    const txs = [
      expense({ id: 'e1', payment_date: '2026-10-28', amount: 582.71, invoice_close: '2026-10-14' }),
    ];
    const live = buildCardInvoices({ card: card14, refISO: '2026-10-11', transactions: txs });
    expect(live.current.total).toBe(582.71);

    const sept = buildCardInvoices({
      card: card14,
      refISO: '2026-09-30',
      monthKey: '2026-09',
      transactions: txs,
    });
    expect(sept.current.total).toBe(0);
    expect(sept.upcomingInvoices).toHaveLength(0);
  });

  it('vinculada antiga fora da janela continua visível na lista', () => {    const built = buildCardInvoices({
      card: card14,
      refISO: '2026-10-11',
      transactions: [
        // Junho natural seria 06-14; com vínculo vai para janeiro.
        expense({ id: 'e1', payment_date: '2026-06-05', amount: 50, invoice_close: '2026-01-14' }),
      ],
    });

    const june = built.invoices.find((inv) => inv.closeISO === '2026-06-14');
    expect(june.total).toBe(0);
    const jan = built.invoices.find((inv) => inv.closeISO === '2026-01-14');
    expect(jan.total).toBe(50);
  });
});

describe('cardCycles — mês da fatura é o do vencimento (vale todos os cartões)', () => {  it('fecha 30/vence 7: compra de 11/10 cai no ciclo que vence 07/11', () => {
    const cycles = cardCycles(
      { closing_day: 30, due_day: 7 },
      '2026-10-11',
      6
    );
    const containing = cycles
      .filter((cycle) => cycle.closeISO >= '2026-10-11')
      .sort((a, b) => a.closeISO.localeCompare(b.closeISO))[0];
    // Fecha 30/10, vence 07/11 → fatura "de novembro"
    expect(containing.closeISO).toBe('2026-10-30');
    expect(containing.dueISO).toBe('2026-11-07');
    expect(containing.dueISO.slice(0, 7)).toBe('2026-11');
  });

  it('fecha 14/vence 20: compra de 16/06 cai no ciclo que vence 20/07', () => {
    const cycles = cardCycles(
      { closing_day: 14, due_day: 20 },
      '2026-08-31',
      6
    );
    const containing = cycles
      .filter((cycle) => cycle.closeISO >= '2026-06-16')
      .sort((a, b) => a.closeISO.localeCompare(b.closeISO))[0];
    expect(containing.closeISO).toBe('2026-07-14');
    expect(containing.dueISO).toBe('2026-07-20');
    expect(containing.dueISO.slice(0, 7)).toBe('2026-07');
  });
});

describe('fatura corrente = fatura do mês (vencimento), com pagamento como despesa vinculada', () => {
  const nubank = {
    id: 'acc-nubank',
    linked_account_id: 'acc-nuconta',
    name: 'Nubank',
    closing_day: 30,
    due_day: 7,
    currency: 'BRL',
  };
  const buy = (over) => ({
    id: 'c',
    account_id: 'acc-nubank',
    type: 'DESPESA',
    status: 'PAGO',
    description: 'Compra',
    ...over,
  });
  const pay = (over) => ({
    id: 'p',
    account_id: 'acc-nuconta',
    type: 'DESPESA',
    status: 'PAGO',
    description: 'Pagamento de fatura — Nubank',
    ...over,
  });

  it('invoiceCloseForDueMonth: outubro → fecha 30/09 (fecha 30/vence 7)', () => {
    expect(invoiceCloseForDueMonth(nubank, '2026-10')).toBe('2026-09-30');
    expect(invoiceCloseForDueMonth({ closing_day: 14, due_day: 20 }, '2026-10')).toBe(
      '2026-10-14'
    );
  });

  it('em outubro a corrente é Outubro (fecha 30/09, vence 07/10) — pode estar PAGA', () => {
    const built = buildCardInvoices({
      card: nubank,
      refISO: '2026-10-12',
      transactions: [
        buy({ id: 'c1', payment_date: '2026-10-07', amount: 100 }),
        buy({ id: 'c2', payment_date: '2026-10-08', amount: 50 }),
        pay({ id: 'p1', payment_date: '2026-10-06', amount: 150, invoice_close: '2026-09-30' }),
      ],
    });

    expect(built.current.closeISO).toBe('2026-09-30');
    expect(built.current.dueISO).toBe('2026-10-07');
    expect(built.current.total).toBe(150);
    expect(built.current.openAmount).toBe(0);
    expect(built.current.status).toBe('PAGA');
    // Sem chip duplicado na lista de fechadas.
    expect(built.invoices.some((inv) => inv.closeISO === '2026-09-30')).toBe(false);
  });

  it('despesa conta no mês do vencimento (extrato/movimento seguem a fatura)', () => {
    const { current } = buildCardInvoices({
      card: nubank,
      refISO: '2026-10-12',
      transactions: [
        // 12/10 na fatura de novembro aparece em novembro, não em outubro.
        buy({ id: 'nov', payment_date: '2026-10-12', amount: 77, invoice_close: '2026-10-30' }),
      ],
    });
    expect(current.total).toBe(0);
  });
});

describe('planCardAnticipation — antecipar parcelas de cartão', () => {
  // 1000 em 4x: nov 1/4, dez 2/4, jan 3/4, fev 4/4 (exemplo do usuário).
  const series4x = () => [
    { id: 'p1', payment_date: '2026-11-10', amount: 250, invoice_close: '2026-10-30', installments_current: 1, installments_total: 4 },
    { id: 'p2', payment_date: '2026-12-10', amount: 250, invoice_close: '2026-11-30', installments_current: 2, installments_total: 4 },
    { id: 'p3', payment_date: '2027-01-10', amount: 250, invoice_close: '2026-12-30', installments_current: 3, installments_total: 4 },
    { id: 'p4', payment_date: '2027-02-10', amount: 250, invoice_close: '2027-01-30', installments_current: 4, installments_total: 4 },
  ];

  it('antecipar 1: 2/4 vai ao destino, 3/4 e 4/4 sobem (shift reverso)', () => {
    const { moves, moved, shifted } = planCardAnticipation({
      series: series4x(),
      anchorId: 'p1',
      count: 1,
      targetClose: '2026-10-30',
    });
    expect(moved.map((row) => row.id)).toEqual(['p2']);
    expect(shifted.map((row) => row.id)).toEqual(['p3', 'p4']);
    expect(moves).toEqual([
      { id: 'p2', invoice_close: '2026-10-30' },
      { id: 'p3', invoice_close: '2026-11-30' },
      { id: 'p4', invoice_close: '2026-12-30' },
    ]);
  });

  it('antecipar todas esvazia as faturas futuras', () => {
    const { moves, moved, shifted } = planCardAnticipation({
      series: series4x(),
      anchorId: 'p1',
      count: 3,
      targetClose: '2026-10-30',
    });
    expect(moved.map((row) => row.id)).toEqual(['p2', 'p3', 'p4']);
    expect(shifted).toEqual([]);
    expect(moves.every((move) => move.invoice_close === '2026-10-30')).toBe(true);
  });

  it('conta além das restantes limita a todas; zero ou sem destino não move', () => {
    const over = planCardAnticipation({
      series: series4x(),
      anchorId: 'p1',
      count: 9,
      targetClose: '2026-10-30',
    });
    expect(over.moved).toHaveLength(3);
    expect(planCardAnticipation({ series: series4x(), anchorId: 'p1', count: 0, targetClose: '2026-10-30' }).moves).toEqual([]);
    expect(planCardAnticipation({ series: series4x(), anchorId: 'p1', count: 1, targetClose: '' }).moves).toEqual([]);
  });

  it('isParceladaTx: só série N/M com total > 1', () => {
    expect(isParceladaTx({ installments_total: 4 })).toBe(true);
    expect(isParceladaTx({ installments_total: 1 })).toBe(false);
    expect(isParceladaTx({})).toBe(false);
    expect(isParceladaTx(null)).toBe(false);
  });
});
