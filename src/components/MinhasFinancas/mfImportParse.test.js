import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  parseFlexibleDate,
  parseOfx,
  parseCsv,
  guessCsvMapping,
  mapCsvRows,
  similarDescription,
  suggestMatches,
} from './mfImportParse';

describe('parseAmount', () => {
  it('entende pt-BR, en, contabilidade e sinais', () => {
    expect(parseAmount('R$ 1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1234,56')).toBe(1234.56);
    expect(parseAmount('(50,00)')).toBe(-50);
    expect(parseAmount('-90')).toBe(-90);
    expect(parseAmount('1.234')).toBe(1234);
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('0.5')).toBe(0.5);
    expect(parseAmount('USD 25')).toBe(25);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it('aceita ISO, DD/MM/YYYY, MM/DD/YYYY e YYYYMMDD', () => {
    expect(parseFlexibleDate('2026-09-10')).toBe('2026-09-10');
    expect(parseFlexibleDate('10/09/2026')).toBe('2026-09-10');
    expect(parseFlexibleDate('09/13/2026')).toBe('2026-09-13'); // 2º campo > 12 → MM/DD
    expect(parseFlexibleDate('20260910')).toBe('2026-09-10');
    expect(parseFlexibleDate('20260910120000')).toBe('2026-09-10');
    expect(parseFlexibleDate('abc')).toBeNull();
    expect(parseFlexibleDate('31/02/2026')).toBeNull(); // dia inexistente
    expect(parseFlexibleDate('2026-13-01')).toBeNull(); // mês inexistente
  });
});

describe('parseOfx', () => {
  const OFX = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    '<OFX>',
    '<STMTRS>',
    '<CURDEF>BRL',
    '<BANKTRANLIST>',
    '<STMTTRN>',
    '<TRNTYPE>DEBIT',
    '<DTPOSTED>20260910',
    '<TRNAMT>-80,50',
    '<FITID>f1',
    '<MEMO>Mercado Pao e Casa',
    '</STMTTRN>',
    '<STMTTRN>',
    '<TRNTYPE>CREDIT',
    '<DTPOSTED>2026-09-15',
    '<TRNAMT>1500,00',
    '<FITID>f2',
    '<NAME>Salario Mensal',
    '</STMTTRN>',
    '</BANKTRANLIST>',
    '</STMTRS>',
    '</OFX>',
  ].join('\n');

  it('extrai linhas com data, valor sinalizado e tipo', () => {
    const parsed = parseOfx(OFX);
    expect(parsed.ok).toBe(true);
    expect(parsed.curdef).toBe('BRL');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-09-10',
      description: 'Mercado Pao e Casa',
      amount: 80.5,
      type: 'DESPESA',
      external_id: 'f1',
    });
    expect(parsed.rows[1]).toMatchObject({
      date: '2026-09-15',
      description: 'Salario Mensal',
      amount: 1500,
      type: 'RECEITA',
    });
  });

  it('rejeita texto que não é OFX', () => {
    expect(parseOfx('não é um extrato').ok).toBe(false);
    expect(parseOfx('').ok).toBe(false);
  });
});

describe('parseCsv + guessCsvMapping + mapCsvRows', () => {
  const CSV =
    'Data;Descrição;Valor\n' +
    '10/09/2026;Mercado Pão;"-1.234,56"\n' +
    '15/09/2026;Salário;2.500,00\n';

  it('detecta delimitador, cabeçalhos e aspas', () => {
    const parsed = parseCsv(CSV);
    expect(parsed.ok).toBe(true);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toEqual(['Data', 'Descrição', 'Valor']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual(['10/09/2026', 'Mercado Pão', '-1.234,56']);
  });

  it('adivinha o mapeamento e converte linhas (sinal → tipo)', () => {
    const parsed = parseCsv(CSV);
    const mapping = guessCsvMapping(parsed.headers);
    expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2, type: -1 });

    const { rows, invalid } = mapCsvRows({ rows: parsed.rows, mapping });
    expect(invalid).toBe(0);
    expect(rows[0]).toMatchObject({
      date: '2026-09-10',
      description: 'Mercado Pão',
      amount: 1234.56,
      type: 'DESPESA',
    });
    expect(rows[1]).toMatchObject({
      date: '2026-09-15',
      amount: 2500,
      type: 'RECEITA',
    });
  });

  it('respeita a inversão de sinal (positivo = despesa)', () => {
    const parsed = parseCsv('Data;Valor\n10/09/2026;90,00\n');
    const mapping = guessCsvMapping(parsed.headers);
    const { rows } = mapCsvRows({ rows: parsed.rows, mapping, invertAmount: true });
    expect(rows[0]).toMatchObject({ amount: 90, type: 'DESPESA' });
  });

  it('descarta linhas sem data ou valor válidos', () => {
    const parsed = parseCsv('Data;Valor\nfoo;bar\n10/09/2026;x\n');
    const mapping = guessCsvMapping(parsed.headers);
    const { rows, invalid } = mapCsvRows({ rows: parsed.rows, mapping });
    expect(rows).toHaveLength(0);
    expect(invalid).toBe(2);
  });
});

describe('suggestMatches — conciliação por valor + data + descrição', () => {
  const existing = [
    {
      id: 'tx1',
      type: 'DESPESA',
      amount: 100,
      payment_date: '2026-09-10',
      status: 'PAGO',
      description: 'Mercado Pão',
    },
    {
      id: 'tx2',
      type: 'RECEITA',
      amount: 200,
      payment_date: '2026-09-15',
      status: 'PAGO',
      description: 'Salário',
    },
    // transferência e cancelados ficam de fora do pool
    {
      id: 'tx3',
      type: 'TRANSFERENCIA',
      amount: 50,
      payment_date: '2026-09-12',
      status: 'PAGO',
      description: 'Farmácia',
    },
    {
      id: 'tx4',
      type: 'DESPESA',
      amount: 50,
      payment_date: '2026-09-12',
      status: 'CANCELADO',
      description: 'Farmácia',
    },
  ];

  const rows = [
    // dentro de 3 dias + descrição parecida (acentos) → tx1
    { date: '2026-09-11', description: 'MERCADO PAO', amount: 100, type: 'DESPESA' },
    // assinatura diferente (receita vs despesa) → nada
    { date: '2026-09-12', description: 'Farmácia', amount: 50, type: 'DESPESA' },
    // receita com match → tx2
    { date: '2026-09-16', description: 'Salário', amount: 200, type: 'RECEITA' },
    // mesmo valor/descrição mas fora da janela de 3 dias → nada
    { date: '2026-09-25', description: 'Mercado Pão', amount: 100, type: 'DESPESA' },
    // sem candidato → nada
    { date: '2026-09-20', description: 'Padaria', amount: 30, type: 'DESPESA' },
  ];

  it('sugere apenas combinações de valor (±0,01), data (±3 dias) e descrição', () => {
    const out = suggestMatches(rows, existing);
    expect(out[0].suggestion?.id).toBe('tx1');
    expect(out[1].suggestion).toBeNull(); // transferência/cancelada não contam
    expect(out[2].suggestion?.id).toBe('tx2');
    expect(out[3].suggestion).toBeNull(); // fora da janela
    expect(out[4].suggestion).toBeNull();
  });

  it('similarDescription ignora acento, caixa e casa token comum', () => {
    expect(similarDescription('Mercado Pão', 'MERCADO PAO')).toBe(true);
    expect(similarDescription('Supermercado Pão de Açúcar', 'SUPERMERCADO PAO')).toBe(true);
    expect(similarDescription('Salário Mensal', 'Salario')).toBe(true);
    expect(similarDescription('Padaria', 'Supermercado')).toBe(false);
    expect(similarDescription('', 'X')).toBe(false);
  });
});
