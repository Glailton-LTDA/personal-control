/**
 * Planejador puro de lembretes do Minhas Finanças (Fase 1 in-app e base da
 * Fase 2 push — o servidor espelha estas janelas).
 *
 * Regras decididas com o usuário:
 * - contas "Ignorar nos totais" TAMBÉM geram lembrete;
 * - janelas exatas: D-3 (vence em 3 dias), D-0 (vence hoje) e D+3
 *   (venceu há 3 dias e segue pendente) — cada lançamento dispara uma
 *   única vez por janela, sem spam diário;
 * - transferências são movimento interno, não conta — ficam de fora;
 * - CANCELADO e PAGO nunca geram.
 *
 * Vencimento efetivo: `due_date` quando há; despesa de cartão com fatura
 * escolhida vence no vencimento da fatura (ciclo por closing/due_day);
 * sem vínculo, vale a `payment_date`.
 */

/** Janelas de disparo (diff em dias = vencimento − hoje). */
export const MF_REMINDER_WINDOWS = { UPCOMING: 3, TODAY: 0, OVERDUE: -3 };

const pad = (n) => String(n).padStart(2, '0');

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/**
 * Vencimento (ISO) da fatura `closeISO` no cartão — mesma régua do
 * `cardCycles`: D >= C vence no mês do fechamento, senão no seguinte.
 */
export function invoiceDueISO(account, closeISO) {
  if (!closeISO) return null;
  const parts = String(closeISO).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month] = parts;
  const closing = Number(account?.closing_day) || 1;
  const due = Number(account?.due_day) || 10;
  let dueYear = year;
  let dueMonth = month;
  if (due < closing) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  return `${dueYear}-${pad(dueMonth)}-${pad(Math.min(due, daysInMonth(dueYear, dueMonth)))}`;
}

const isDateISO = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

/** Vencimento efetivo do lançamento (só data; null = sem vencimento). */
export function reminderDueISO(tx, accountById = {}) {
  if (!tx) return null;
  if (isDateISO(tx.due_date)) return tx.due_date.slice(0, 10);
  const account = accountById[tx.account_id] ?? null;
  if (
    tx.type === 'DESPESA' &&
    tx.invoice_close &&
    account?.account_type === 'CARTAO'
  ) {
    const due = invoiceDueISO(account, tx.invoice_close);
    if (due) return due;
  }
  if (isDateISO(tx.payment_date)) return tx.payment_date.slice(0, 10);
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Diferença em dias (vencimento − hoje), em data local (sem fuso). */
export function diffDays(dueISO, todayISO) {
  const [y1, m1, d1] = dueISO.split('-').map(Number);
  const [y2, m2, d2] = todayISO.split('-').map(Number);
  const due = Date.UTC(y1, m1 - 1, d1);
  const today = Date.UTC(y2, m2 - 1, d2);
  return Math.round((due - today) / DAY_MS);
}

/**
 * Gera os lembretes do dia. `rows` = lançamentos (formato mf_transactions),
 * `accountsById` = { [account_id]: conta }. Retorna ordenado por
 * vencimento (atrasados primeiro) e limitado a `limit` (padrão 50).
 */
export function planMFReminders(
  rows,
  { accountsById = {}, todayISO, limit = 50 } = {}
) {
  if (!todayISO || !Array.isArray(rows)) return [];
  const out = [];
  for (const tx of rows) {
    if (!tx?.id || tx.status === 'PAGO' || tx.status === 'CANCELADO') continue;
    if (tx.type === 'TRANSFERENCIA') continue;
    const dueISO = reminderDueISO(tx, accountsById);
    if (!dueISO) continue;
    const diff = diffDays(dueISO, todayISO);
    let kind = null;
    if (diff === MF_REMINDER_WINDOWS.UPCOMING) kind = 'upcoming';
    else if (diff === MF_REMINDER_WINDOWS.TODAY) kind = 'today';
    else if (diff === MF_REMINDER_WINDOWS.OVERDUE) kind = 'overdue';
    if (!kind) continue;
    const account = accountsById[tx.account_id] ?? null;
    out.push({
      key: `${tx.id}:${kind}`,
      txId: tx.id,
      kind,
      dueISO,
      diff,
      description: String(tx.description ?? '').trim() || '—',
      amount: Number(tx.amount) || 0,
      type: tx.type,
      currency: account?.currency || 'BRL',
      accountId: tx.account_id ?? null,
      accountName: account?.name ?? null,
      installmentsCurrent: Number(tx.installments_current) || null,
      installmentsTotal: Number(tx.installments_total) || null,
    });
  }
  out.sort(
    (a, b) =>
      a.dueISO.localeCompare(b.dueISO) ||
      Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0)
  );
  return out.slice(0, Math.max(0, limit));
}
