import { describe, it, expect, beforeEach } from 'vitest';
import {
  MF_MONTH_STORAGE_KEY,
  MF_DETAIL_STORAGE_KEY,
  readMonthKey,
  writeMonthKey,
  readDrill,
  writeDrill,
  readInvoiceSel,
  writeInvoiceSel,
  clearInvoiceSel,
} from './mfViewState';

describe('mfViewState — persistência de vista (F5)', () => {
  beforeEach(() => {
    localStorage.removeItem(MF_MONTH_STORAGE_KEY);
    localStorage.removeItem(MF_DETAIL_STORAGE_KEY);
    clearInvoiceSel();
  });

  it('mês: lê o salvo válido e ignora inválido', () => {
    expect(readMonthKey('2026-10')).toBe('2026-10');
    localStorage.setItem(MF_MONTH_STORAGE_KEY, '2026-09');
    expect(readMonthKey('2026-10')).toBe('2026-09');
    localStorage.setItem(MF_MONTH_STORAGE_KEY, 'outubro');
    expect(readMonthKey('2026-10')).toBe('2026-10');
    localStorage.setItem(MF_MONTH_STORAGE_KEY, '2026-13');
    expect(readMonthKey('2026-10')).toBe('2026-10');
  });

  it('mês: grava válido e ignora inválido', () => {
    writeMonthKey('2026-09');
    expect(localStorage.getItem(MF_MONTH_STORAGE_KEY)).toBe('2026-09');
    writeMonthKey('invalido');
    expect(localStorage.getItem(MF_MONTH_STORAGE_KEY)).toBe('2026-09');
  });

  it('drill: lê {tab, id} válido e ignora o resto', () => {
    expect(readDrill()).toBeNull();
    writeDrill({ tab: 'accounts', id: 'acc-1' });
    expect(readDrill()).toEqual({ tab: 'accounts', id: 'acc-1' });
    localStorage.setItem(MF_DETAIL_STORAGE_KEY, 'lixo{');
    expect(readDrill()).toBeNull();
    localStorage.setItem(MF_DETAIL_STORAGE_KEY, JSON.stringify({ tab: 'x', id: 'acc-1' }));
    expect(readDrill()).toBeNull();
  });

  it('drill: null limpa ao fechar', () => {
    writeDrill({ tab: 'cards', id: 'c1' });
    writeDrill(null);
    expect(localStorage.getItem(MF_DETAIL_STORAGE_KEY)).toBeNull();
  });

  it('fatura: lê/escreve por cartão e ignora inválido', () => {
    expect(readInvoiceSel('c1')).toBeNull();
    writeInvoiceSel('c1', '2026-08-10');
    expect(readInvoiceSel('c1')).toBe('2026-08-10');
    // outro cartão não vaza
    expect(readInvoiceSel('c2')).toBeNull();
    // formato inválido é ignorado (não grava nem lê)
    writeInvoiceSel('c1', 'agosto');
    expect(readInvoiceSel('c1')).toBe('2026-08-10');
    localStorage.setItem('mf_invoice_sel_c1', 'lixo');
    expect(readInvoiceSel('c1')).toBeNull();
    expect(readInvoiceSel('')).toBeNull();
  });

  it('fatura: current/nulo limpa (volta ao padrão)', () => {
    writeInvoiceSel('c1', '2026-08-10');
    writeInvoiceSel('c1', 'current');
    expect(localStorage.getItem('mf_invoice_sel_c1')).toBeNull();
    writeInvoiceSel('c1', '2026-08-10');
    writeInvoiceSel('c1', null);
    expect(localStorage.getItem('mf_invoice_sel_c1')).toBeNull();
  });

  it('fatura: clearInvoiceSel remove só as chaves de fatura', () => {
    writeInvoiceSel('c1', '2026-08-10');
    writeDrill({ tab: 'cards', id: 'c1' });
    clearInvoiceSel();
    expect(localStorage.getItem('mf_invoice_sel_c1')).toBeNull();
    expect(readDrill()).toEqual({ tab: 'cards', id: 'c1' });
  });
});
