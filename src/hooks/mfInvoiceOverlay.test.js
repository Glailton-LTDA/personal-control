import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
}));

import {
  applyCardInvoiceRecords,
  applyInvoiceRecord,
  buildInvoiceRecordMap,
  getInvoiceRecord,
  isOfficialInvoiceRecord,
} from './useMinhasFinancas';

const invoice = (overrides = {}) => ({
  closeISO: '2026-10-30',
  dueISO: '2026-11-07',
  total: 100,
  paid: 0,
  openAmount: 100,
  pendingBound: 0,
  refunds: 0,
  status: 'CORRENTE',
  ...overrides,
});

const record = (overrides = {}) => ({
  card_id: 'card-1',
  close_date: '2026-10-30',
  total: 100,
  total_source: 'manual',
  paid_total: 0,
  status: 'OPEN',
  ...overrides,
});

describe('fonte oficial da fatura (mf_invoices)', () => {
  it('só manual/imported sobrepõem o cálculo derivado', () => {
    expect(isOfficialInvoiceRecord({ total_source: 'manual' })).toBe(true);
    expect(isOfficialInvoiceRecord({ total_source: 'imported' })).toBe(true);
    expect(isOfficialInvoiceRecord({ total_source: 'derived' })).toBe(false);
    expect(isOfficialInvoiceRecord(null)).toBe(false);
  });

  it('registro derived do backfill não zera a fatura derivada', () => {
    const inv = invoice();
    const out = applyInvoiceRecord(
      inv,
      record({ total_source: 'derived', total: 999, paid_total: 999, status: 'PAID' }),
      '2026-10-01'
    );
    expect(out).toBe(inv);
    expect(out.total).toBe(100);
    expect(out.openAmount).toBe(100);
  });

  it('baixa manual total marca PAGA, zera o em aberto e o agendado', () => {
    const out = applyInvoiceRecord(
      invoice({ pendingBound: 10 }),
      record({ total: 100, paid_total: 100, status: 'PAID' }),
      '2026-10-01'
    );
    expect(out.status).toBe('PAGA');
    expect(out.total).toBe(100);
    expect(out.openAmount).toBe(0);
    expect(out.pendingBound).toBe(0);
    expect(out.manual).toBe(true);
  });

  it('baixa parcial mantém o restante em aberto e pode vencer', () => {
    const out = applyInvoiceRecord(
      invoice({ dueISO: '2026-09-07', pendingBound: 5 }),
      record({ total: 100, paid_total: 40, status: 'OPEN' }),
      '2026-10-01'
    );
    expect(out.status).toBe('VENCIDA');
    expect(out.openAmount).toBe(60);
    expect(out.pendingBound).toBe(5);
  });

  it('total importado é líquido: zera estornos derivados', () => {
    const out = applyInvoiceRecord(
      invoice({ refunds: 25 }),
      record({ total_source: 'imported', total: 75, paid_total: 75, status: 'PAID' }),
      '2026-10-01'
    );
    expect(out.total).toBe(75);
    expect(out.refunds).toBe(0);
    expect(out.status).toBe('PAGA');
  });

  it('índice por cartão + fechamento e overlay recalculam os agregados', () => {
    const map = buildInvoiceRecordMap([
      record({ close_date: '2026-10-30', total: 300, paid_total: 300, status: 'PAID' }),
      record({ close_date: '2026-08-30', total: 50, paid_total: 0, status: 'OVERDUE' }),
      // derived: deve ser ignorado
      record({
        close_date: '2026-09-30',
        total_source: 'derived',
        total: 999,
        paid_total: 999,
        status: 'PAID',
      }),
    ]);
    expect(getInvoiceRecord(map, 'card-1', '2026-10-30')?.total).toBe(300);
    expect(getInvoiceRecord(map, 'card-2', '2026-10-30')).toBeNull();

    const built = {
      current: invoice({ closeISO: '2026-10-30', total: 300, openAmount: 300 }),
      invoices: [
        invoice({ closeISO: '2026-09-30', total: 100, openAmount: 100 }),
        invoice({
          closeISO: '2026-08-30',
          dueISO: '2026-09-07',
          total: 50,
          openAmount: 50,
          pendingBound: 20,
        }),
      ],
      upcomingInvoices: [
        invoice({ closeISO: '2026-11-30', total: 80, openAmount: 80 }),
      ],
      openTotal: 530,
      pendingTotal: 20,
      oldestOpenInvoice: null,
    };

    const out = applyCardInvoiceRecords(built, map, 'card-1', '2026-10-01');
    expect(out.current.status).toBe('PAGA');
    expect(out.current.openAmount).toBe(0);
    expect(out.invoices[0].openAmount).toBe(100); // derived ignorado
    expect(out.invoices[1].status).toBe('VENCIDA');
    expect(out.openTotal).toBe(230);
    expect(out.pendingTotal).toBe(20);
    expect(out.oldestOpenInvoice.closeISO).toBe('2026-08-30');
  });
});
