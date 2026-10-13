import { describe, it, expect } from 'vitest';
import { escapeXml, xlsCell, buildXls } from './mfReportXls';

describe('escapeXml', () => {
  it('escapa &, <, > e aspas', () => {
    expect(escapeXml('A & B <tag> "x"')).toBe('A &amp; B &lt;tag&gt; &quot;x&quot;');
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(42)).toBe('42');
  });
});

describe('xlsCell', () => {
  it('números finite viram célula numérica', () => {
    const cell = xlsCell(45.9);
    expect(cell).toContain('ss:StyleID="number"');
    expect(cell).toContain('<Data ss:Type="Number">45.9</Data>');
  });

  it('textos viram string escapada com estilo text', () => {
    const cell = xlsCell('A & B');
    expect(cell).toContain('ss:StyleID="text"');
    expect(cell).toContain('ss:Type="String"');
    expect(cell).toContain('A &amp; B');
  });

  it('não finite e valores não numéricos viram texto', () => {
    expect(xlsCell(NaN)).toContain('ss:Type="String"');
    expect(xlsCell('R$ 1,00')).toContain('ss:Type="String"');
  });

  it('styleId sobrepõe o estilo automático', () => {
    expect(xlsCell('Cabeçalho', 'h')).toContain('ss:StyleID="h"');
    expect(xlsCell('Título', 'title')).toContain('ss:StyleID="title"');
  });
});

describe('buildXls — SpreadsheetML (Fase 9)', () => {
  const xml = buildXls({
    title: 'Relatório & cia',
    summaryName: 'Resumo',
    detailName: 'Lançamentos',
    kpis: [
      ['Período', '2026-01 – 2026-06'],
      ['Receitas', 'R$ 1.000,00'],
      ['Lançamentos', '2'],
    ],
    headers: ['Data', 'Descrição', 'Valor'],
    rows: [
      ['2026-06-01', 'Almoço & café', 45.9],
      ['2026-06-02', 'Salário', 3000],
    ],
  });

  it('gera XML do Excel com as duas planilhas', () => {
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"');
    expect(xml).toContain('ss:Name="Resumo"');
    expect(xml).toContain('ss:Name="Lançamentos"');
    expect(xml).toContain('Relatório &amp; cia');
  });

  it('escapa conteúdo das células', () => {
    expect(xml).toContain('Almoço &amp; café');
    expect(xml).not.toMatch(/Data ss:Type="String">[^<]*&[^a]/); // sem & solto
  });

  it('tipa valores numéricos e aplica estilo de cabeçalho', () => {
    expect(xml).toContain('<Data ss:Type="Number">45.9</Data>');
    expect(xml).toContain('<Data ss:Type="Number">3000</Data>');
    expect(xml).toContain('ss:StyleID="h"');
    expect(xml).toContain('ss:StyleID="label"');
  });

  it('funciona com dados vazios', () => {
    const empty = buildXls({});
    expect(empty).toContain('ss:Name="Resumo"');
    expect(empty).toContain('ss:Name="Lançamentos"');
    expect(empty).toContain('</Workbook>');
    expect(empty).not.toContain('NaN');
  });
});
