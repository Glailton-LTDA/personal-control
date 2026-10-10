import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Exporta o relatório filtrado em PDF (Fase 6): título, período, KPIs e
 * tabela de lançamentos. Segue o padrão de exportação do módulo Viagens.
 */
export const exportReportPdf = ({ title, subtitle, kpis, headers, rows }) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 28);

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(kpis.summary, 14, 38);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 43, pageWidth - 14, 43);

  autoTable(doc, {
    startY: 48,
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell ?? ''))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `PersonalControl — ${doc.internal.getNumberOfPages()}`,
    pageWidth - 14,
    doc.internal.pageSize.height - 8,
    { align: 'right' }
  );

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};
