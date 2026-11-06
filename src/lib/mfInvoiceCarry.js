const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const realPaid = (invoice) => Math.min(Math.max(0, money(invoice.total)), Math.max(0,
  money((Number(invoice.paid) || 0) - (Number(invoice.pendingBound) || 0))));

/** Linhas de extrato derivadas: nunca inserir como novas despesas/receitas.
 * Cada obrigação continua pertencendo ao ciclo original. Agendamento não
 * é crédito recebido, e as mesmas faturas são deduplicadas pelo fechamento. */
export function buildInvoiceCarry(activeInvoice, invoices = [], payments = [], refISO) {
  if (!activeInvoice?.closeISO) return { rows: [], outstanding: 0 };
  const unique = new Map();
  for (const invoice of invoices) {
    if (invoice?.closeISO && invoice.closeISO < activeInvoice.closeISO &&
        (!refISO || invoice.closeISO <= refISO)) unique.set(invoice.closeISO, invoice);
  }
  const previous = [...unique.values()].sort((a, b) => b.closeISO.localeCompare(a.closeISO));
  const rows = [];
  let outstanding = 0;
  previous.forEach((invoice, index) => {
    const total = Math.max(0, money(invoice.total));
    const paid = realPaid(invoice);
    const open = money(total - paid);
    // A imediatamente anterior mostra débito + quitação mesmo já paga.
    // Dívidas mais antigas continuam até serem quitadas, sem duplicação.
    if (total === 0 || (index > 0 && open === 0)) return;
    rows.push({ id: `carry-${invoice.closeISO}`, kind: 'previous', amount: -total,
      invoice, date: invoice.closeISO, outstanding: open });
    let remaining = paid;
    const receipts = payments.filter((tx) => tx.invoice_close === invoice.closeISO && tx.status === 'PAGO')
      .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)) || String(a.id).localeCompare(String(b.id)));
    for (const tx of receipts) {
      const amount = Math.min(remaining, Math.max(0, money(tx.amount)));
      if (!amount) continue;
      rows.push({ id: `receipt-${invoice.closeISO}-${tx.id}`, kind: 'payment', amount,
        invoice, date: tx.payment_date });
      remaining = money(remaining - amount);
    }
    // Baixa manual e crédito FIFO têm valor oficial, mas podem não ter
    // lançamento individual disponível. Não inventar data ou transação.
    if (remaining > 0) rows.push({ id: `receipt-${invoice.closeISO}-allocated`, kind: 'payment',
      amount: remaining, invoice, date: null });
    outstanding = money(outstanding + open);
  });
  return { rows, outstanding };
}

export const invoiceOutstanding = (invoice) => money(Math.max(0, (Number(invoice?.total) || 0) - realPaid(invoice || {})));
