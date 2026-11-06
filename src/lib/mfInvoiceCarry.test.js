import { describe, it, expect } from 'vitest';
import { buildInvoiceCarry, invoiceOutstanding } from './mfInvoiceCarry';

const november = { closeISO: '2026-11-03', dueISO: '2026-11-10', total: 1000, paid: 0, pendingBound: 0 };
const december = { closeISO: '2026-12-03', dueISO: '2026-12-10', total: 200, paid: 0 };
const receipt = (id, amount, status = 'PAGO') => ({ id, invoice_close: november.closeISO, payment_date: '2026-11-15', amount, status });

describe('extrato de dívida anterior do cartão', () => {
  it('carrega a fatura anterior como débito de -1000, sem mutar a dívida original', () => {
    const original = { ...november };
    const carry = buildInvoiceCarry(december, [november], [], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000]);
    expect(carry.outstanding).toBe(1000);
    expect(november).toEqual(original);
  });
  it('pagamento parcial gera crédito +400 e deixa 600 além das compras do mês', () => {
    const carry = buildInvoiceCarry(december, [{ ...november, paid: 400 }], [receipt('p1', 400)], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000, 400]);
    expect(carry.outstanding).toBe(600);
    expect(carry.outstanding + invoiceOutstanding(december)).toBe(800);
  });
  it('mostra cada pagamento recebido e a quitação total da imediatamente anterior', () => {
    const carry = buildInvoiceCarry(december, [{ ...november, paid: 1000 }], [receipt('p1', 400), receipt('p2', 600)], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000, 400, 600]);
    expect(carry.outstanding).toBe(0);
  });
  it('agendamento não é pagamento recebido', () => {
    const carry = buildInvoiceCarry(december, [{ ...november, paid: 1000, pendingBound: 1000 }], [receipt('p1', 1000, 'PENDENTE')], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000]);
    expect(carry.outstanding).toBe(1000);
  });
  it('baixa manual e FIFO geram o crédito oficial sem inventar uma transação', () => {
    const carry = buildInvoiceCarry(december, [{ ...november, paid: 400, manual: true }], [], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000, 400]);
    expect(carry.rows[1].date).toBeNull();
  });
  it('não duplica a mesma fatura e mantém dívidas antigas sem repetir as quitadas', () => {
    const october = { closeISO: '2026-10-03', total: 500, paid: 200 };
    const september = { closeISO: '2026-09-03', total: 900, paid: 900 };
    const carry = buildInvoiceCarry(december, [november, november, october, september, december], [], '2026-12-31');
    expect(carry.outstanding).toBe(1300);
    expect(carry.rows.filter((r) => r.kind === 'previous')).toHaveLength(2);
  });
  it('não carrega fatura que ainda não fechou na data de referência', () => {
    expect(buildInvoiceCarry(december, [november], [], '2026-11-01').rows).toEqual([]);
  });
  it('não credita pagamento cancelado nem valores acima do pago oficial', () => {
    const carry = buildInvoiceCarry(december, [{ ...november, paid: 400 }], [receipt('cancel', 500, 'CANCELADO'), receipt('p1', 2000)], '2026-12-31');
    expect(carry.rows.map((r) => r.amount)).toEqual([-1000, 400]);
  });
});
