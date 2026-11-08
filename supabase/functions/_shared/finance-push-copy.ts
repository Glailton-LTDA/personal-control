import messages from './finance-push-messages.json' with { type: 'json' };
const resource = (language: string) =>
  messages[language as keyof typeof messages] || messages.pt;
const locale = (language: string) =>
  ({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' })[language] || 'pt-BR';
function money(amount: number, currency: string, language: string) {
  try {
    return new Intl.NumberFormat(locale(language), {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
export function financeTransactionCopy(
  row: {
    description: string;
    suffix: string;
    kind: string;
    amount: number;
    currency: string;
    accountName: string;
    extra: number;
  },
  language: string,
) {
  const copy = resource(language);
  const when = copy[row.kind as 'upcoming' | 'today' | 'overdue'] || copy.today;
  return {
    title: `${row.description || copy.transaction}${row.suffix} ${when}`,
    body: `${money(row.amount, row.currency, language)}${row.accountName ? ` · ${row.accountName}` : ''}${row.extra ? ` ${fill(copy.extra, { count: row.extra })}` : ''}`,
  };
}
export function financeInvoiceCopy(
  row: {
    cardName: string;
    total: number;
    currency: string;
    open: number;
    pending: number;
    dueISO: string;
  },
  language: string,
) {
  const copy = resource(language);
  const status =
    row.open > 0.005
      ? fill(copy.open, { amount: money(row.open, row.currency, language) })
      : row.pending > 0.005
        ? copy.scheduled
        : copy.paid;
  const date = new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${row.dueISO}T12:00:00Z`));
  return {
    title: fill(copy.invoice_title, { name: row.cardName || copy.card }),
    body: `${fill(copy.total, { amount: money(row.total, row.currency, language) })} · ${fill(copy.due, { date })} · ${status}`,
  };
}
