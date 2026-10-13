/**
 * Exportação XLS do relatório (Fase 9 — adiada da Fase 6).
 *
 * Gera SpreadsheetML (Excel 2003 XML) salvo como `.xls`: abre nativamente
 * no Excel/LibreOffice com duas planilhas — "Resumo" (KPIs do período) e
 * "Lançamentos" (detalhe com a coluna de valor numérica, pronta para
 * fórmulas) — sem nenhuma dependência nova.
 */
import { downloadText } from './mfReports';

/** Escape de texto para célula XML. */
export const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Célula XML: número finite vira célula numérica (formato #,##0.00);
 * o resto é texto. `styleId` sobrepõe o estilo automático ('title',
 * 'label', 'h' para cabeçalho).
 */
export const xlsCell = (value, styleId) => {
  const isNumber = typeof value === 'number' && Number.isFinite(value);
  const style = styleId || (isNumber ? 'number' : 'text');
  const data = isNumber
    ? `<Data ss:Type="Number">${value}</Data>`
    : `<Data ss:Type="String">${escapeXml(value)}</Data>`;
  return `<Cell ss:StyleID="${style}">${data}</Cell>`;
};

const xlsRow = (cells) => `<Row>${cells.join('')}</Row>`;

/**
 * Monta a planilha.
 * @param {object} options
 * @param {string} options.title Título do relatório (célula A1 da Resumo).
 * @param {Array<[string, string|number]>} options.kpis Pares rótulo/valor.
 * @param {string[]} options.headers Cabeçalhos da planilha de detalhe.
 * @param {Array<Array<string|number>>} options.rows Linhas do detalhe
 *   (números → células numéricas).
 * @param {string} [options.summaryName] Nome da aba de resumo.
 * @param {string} [options.detailName] Nome da aba de detalhe.
 */
export const buildXls = ({
  title = '',
  kpis = [],
  headers = [],
  rows = [],
  summaryName = 'Resumo',
  detailName = 'Lançamentos',
} = {}) => {
  const summaryRows = [
    xlsRow([xlsCell(title, 'title')]),
    ...kpis.map(([label, value]) =>
      xlsRow([xlsCell(label, 'label'), xlsCell(value)])
    ),
  ];

  const detailRows = [
    xlsRow(headers.map((header) => xlsCell(header, 'h'))),
    ...rows.map((row) => xlsRow(row.map((cell) => xlsCell(cell)))),
  ];

  const worksheet = (name, tableRows) =>
    `<Worksheet ss:Name="${escapeXml(name)}"><Table>${tableRows.join('')}</Table></Worksheet>`;

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="13"/></Style>
  <Style ss:ID="label"><Font ss:Bold="1"/></Style>
  <Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E6F4F8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="text"><NumberFormat ss:Format="@"/></Style>
  <Style ss:ID="number"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 ${worksheet(summaryName, summaryRows)}
 ${worksheet(detailName, detailRows)}
</Workbook>`;
};

/** Baixa a planilha como `.xls` (MIME do Excel). */
export const exportReportXls = (options, filename) => {
  downloadText(buildXls(options), filename, 'application/vnd.ms-excel');
};
