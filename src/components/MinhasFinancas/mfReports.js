import { monthBounds, shiftMonth } from '../../hooks/useMinhasFinancas';

/**
 * Lógica pura dos relatórios (Fase 6): filtros, KPIs, série mensal,
 * ranking por categoria, CSV e download. Sem dependência de UI.
 */

const round2 = (value) => Math.round(value * 100) / 100;

/** Limites 'YYYY-MM-DD' de um período em chaves de mês. */
export const reportPeriod = (from, to) => ({
  start: monthBounds(from).start,
  end: monthBounds(to).end,
});

/** Período anterior do mesmo tamanho (comparações "vs. anterior"). */
export const previousPeriod = (from, to) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  const prevFrom = shiftMonth(from, -months);
  const prevTo = shiftMonth(from, -1);
  return { from: prevFrom, to: prevTo, ...reportPeriod(prevFrom, prevTo) };
};

/** Categoria selecionada casa com o lançamento (pai inclui filhos). */
export const matchesCategory = (txCategoryId, selectedId, categoriesById) => {
  if (!selectedId) return true;
  if (txCategoryId === selectedId) return true;
  const cat = categoriesById[txCategoryId];
  return !!cat && cat.parent_id === selectedId;
};

/**
 * Aplica os filtros da tela (período em chaves de mês, tipo, categoria
 * com filhos, conta, tag e moeda — uma moeda por vez, sem cotação).
 * Transferências ficam de fora (não são receita/despesa) e cancelados
 * são ignorados.
 */
export const filterReportRows = ({
  transactions,
  tagIdsByTx = {},
  accountsById = {},
  categoriesById = {},
  filters,
}) => {
  const { start, end } = reportPeriod(filters.from, filters.to);
  return transactions
    .filter((tx) => {
      if (tx.status === 'CANCELADO') return false;
      if (tx.type === 'TRANSFERENCIA') return false;
      if (filters.type && filters.type !== 'ALL' && tx.type !== filters.type) return false;
      if (tx.payment_date < start || tx.payment_date > end) return false;
      const txCurrency = accountsById[tx.account_id]?.currency || 'BRL';
      if (filters.currency && filters.currency !== 'all' && txCurrency !== filters.currency) {
        return false;
      }
      if (filters.account_id && tx.account_id !== filters.account_id) return false;
      if (
        filters.category_id &&
        !matchesCategory(tx.category_id, filters.category_id, categoriesById)
      ) {
        return false;
      }
      if (filters.tag_id && !(tagIdsByTx[tx.id] || []).includes(filters.tag_id)) return false;
      return true;
    })
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
};

/** KPIs: receitas, despesas, saldo, taxa de poupança (%) e contagem. */
export const reportKpis = (rows) => {
  let income = 0;
  let expense = 0;
  rows.forEach((tx) => {
    const value = Number(tx.amount) || 0;
    if (tx.type === 'RECEITA') income += value;
    else if (tx.type === 'DESPESA') expense += value;
  });
  income = round2(income);
  expense = round2(expense);
  return {
    income,
    expense,
    balance: round2(income - expense),
    savingRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    count: rows.length,
  };
};

/** Série mensal (receitas x despesas) mês a mês do período. */
export const reportMonthlySeries = (rows, from, to) => {
  const series = [];
  let key = from;
  let guard = 0;
  while (key <= to && guard < 120) {
    const { start, end } = monthBounds(key);
    const monthRows = rows.filter(
      (tx) => tx.payment_date >= start && tx.payment_date <= end
    );
    const kpis = reportKpis(monthRows);
    series.push({
      key,
      label: `${key.slice(5)}/${key.slice(0, 4)}`,
      income: kpis.income,
      expense: kpis.expense,
    });
    key = shiftMonth(key, 1);
    guard += 1;
  }
  return series;
};

/** Ranking de despesas por categoria (sem categoria → name null). */
export const reportCategoryRanking = (rows, categoriesById = {}, limit = 6) => {
  const totals = {};
  rows
    .filter((tx) => tx.type === 'DESPESA')
    .forEach((tx) => {
      const key = tx.category_id || '__none__';
      totals[key] = (totals[key] || 0) + (Number(tx.amount) || 0);
    });
  return Object.entries(totals)
    .map(([id, value]) => ({
      id,
      name: id === '__none__' ? null : categoriesById[id]?.name ?? null,
      color: categoriesById[id]?.color ?? null,
      value: round2(value),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
};

/** CSV (;) com escape de aspas — cabeçalhos vêm da i18n. */
export const buildCsv = (rows, { accountsById = {}, categoriesById = {} } = {}, headers) => {
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const cols = headers ?? ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Valor', 'Status'];
  const lines = [cols.map(esc).join(';')];
  rows.forEach((tx) => {
    lines.push(
      [
        tx.payment_date,
        tx.description,
        tx.type,
        tx.category_id ? categoriesById[tx.category_id]?.name ?? '' : '',
        accountsById[tx.account_id]?.name ?? '',
        (Number(tx.amount) || 0).toFixed(2).replace('.', ','),
        tx.status,
      ]
        .map(esc)
        .join(';')
    );
  });
  return lines.join('\r\n');
};

/** Baixa um texto como arquivo (BOM para Excel abrir UTF-8). */
export const downloadText = (content, filename, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([`\uFEFF${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
