/**
 * Dados dos gráficos interativos do Resumo.
 *
 * Tudo é calculado no cliente a partir do `mf_month_summary` (rows/chartTxs)
 * que o Resumo já carrega — nenhuma consulta nova por gráfico. As funções
 * aqui são puras para facilitar os testes e manter o componente focado na
 * apresentação.
 */

export const CHART_GROUPINGS = ['type', 'institution', 'group', 'account'];
export const UNGROUPED_KEY = 'mf-ungrouped';

/** Paleta dos gráficos (mesma dos cards e da tela cheia). */
export const CHART_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#84cc16',
  '#38bdf8',
  '#f472b6',
];

const sum = (items, pick) => items.reduce((total, item) => total + (pick(item) || 0), 0);

/** Sobe a hierarquia até o grupo raiz (instituição). */
export function rootGroupOf(groupId, groupsById) {
  let group = groupsById.get(groupId);
  const seen = new Set();
  while (group?.parent_id && groupsById.has(group.parent_id) && !seen.has(group.id)) {
    seen.add(group.id);
    group = groupsById.get(group.parent_id);
  }
  return group ?? null;
}

const accountTypeMeta = (type, types) =>
  types?.[type] ?? { label: type || '', icon: '🏷️' };

const chartKey = (kind, id) => `${kind}:${id}`;

/**
 * Agrupa contas pelos saldos atuais.
 *
 * `rows` deve conter só contas ativas da moeda do gráfico (incluindo as
 * "Ignorar nos totais"; o chamador decide se filtra). `groups` é a lista de
 * `mf_account_groups`.
 *
 * Retorna `[{ key, name, icon, color, value, count, accounts }]`, ordenado
 * do maior saldo para o menor. `accounts` traz a conta e o valor usado.
 */
export function groupAccountsForChart({
  rows = [],
  groups = [],
  grouping = 'type',
  types = {},
  labelUngrouped = '',
} = {}) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const buckets = new Map();

  rows.forEach((row) => {
    let key;
    let name;
    let icon;
    let color;

    if (grouping === 'account') {
      key = chartKey('account', row.id);
      name = row.name;
      icon = row.icon;
      color = row.color;
    } else if (grouping === 'type') {
      const type = row.account_type || 'OUTRO';
      const meta = accountTypeMeta(type, types);
      key = chartKey('type', type);
      name = meta.label;
      icon = meta.icon;
      color = meta.color;
    } else {
      const group = groupsById.get(row.group_id) ?? null;
      const target =
        grouping === 'institution' && group ? rootGroupOf(group.id, groupsById) : group;
      key = target ? chartKey('group', target.id) : UNGROUPED_KEY;
      name = target?.name ?? labelUngrouped;
      icon = target?.icon ?? '📂';
      color = target?.color;
    }

    if (!key) return;
    if (!buckets.has(key)) {
      buckets.set(key, { key, name, icon, color, value: 0, accounts: [] });
    }
    const bucket = buckets.get(key);
    const value = Number(row.saldo) || 0;
    bucket.value += value;
    bucket.accounts.push({ account: row, id: row.id, name: row.name, value });
  });

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      count: bucket.accounts.length,
      accounts: bucket.accounts.sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa lançamentos do mês por categoria (padrão), tipo de conta,
 * instituição, grupo ou conta. Usado nos gráficos de Despesas/Receitas.
 *
 * `grouping='category'` é o padrão dos cards de categoria; os demais
 * agrupamentos só aparecem na tela cheia.
 */
export function groupTransactionsForChart({
  txs = [],
  accountsById = {},
  categoriesById = {},
  type,
  month,
  grouping = 'category',
  types = {},
  groups = [],
  labelUngrouped = '',
  labelUncategorized = '',
} = {}) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const buckets = new Map();

  txs.forEach((tx) => {
    if (tx.t !== type || tx.m !== month) return;
    const account = accountsById[tx.a];
    if (!account) return;

    let key;
    let name;
    let icon;
    let color;

    if (grouping === 'category') {
      const category = tx.cat ? categoriesById[tx.cat] : null;
      key = tx.cat ? chartKey('category', tx.cat) : chartKey('category', 'none');
      name = category?.name ?? labelUncategorized;
      icon = category?.icon ?? '🏷️';
      color = category?.color;
    } else if (grouping === 'type') {
      const accountType = account.account_type || 'OUTRO';
      const meta = accountTypeMeta(accountType, types);
      key = chartKey('type', accountType);
      name = meta.label;
      icon = meta.icon;
      color = meta.color;
    } else if (grouping === 'account') {
      key = chartKey('account', account.id);
      name = account.name;
      icon = account.icon;
      color = account.color;
    } else {
      const group = groupsById.get(account.group_id) ?? null;
      const target =
        grouping === 'institution' && group ? rootGroupOf(group.id, groupsById) : group;
      key = target ? chartKey('group', target.id) : UNGROUPED_KEY;
      name = target?.name ?? labelUngrouped;
      icon = target?.icon ?? '📂';
      color = target?.color;
    }

    if (!key) return;
    if (!buckets.has(key)) {
      buckets.set(key, { key, name, icon, color, value: 0, accounts: new Map() });
    }
    const bucket = buckets.get(key);
    const value = Number(tx.v) || 0;
    bucket.value += value;
    const current = bucket.accounts.get(account.id) ?? {
      account,
      id: account.id,
      name: account.name,
      value: 0,
    };
    current.value += value;
    bucket.accounts.set(account.id, current);
  });

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      count: bucket.accounts.size,
      accounts: [...bucket.accounts.values()].sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Aplica o limite da legenda do card: no máximo `max` categorias + "Outros N".
 * A tela cheia e o card expandido usam a lista completa.
 */
export function limitChartLegend(groups = [], max = 4, otherLabel = 'Outros') {
  if (groups.length <= max) return { items: groups, other: null };
  const items = groups.slice(0, max);
  const rest = groups.slice(max);
  return {
    items,
    other: {
      key: `other:${rest.length}`,
      name: `${otherLabel} ${rest.length}`,
      value: sum(rest, (group) => group.value),
      count: rest.reduce((total, group) => total + (group.count || 0), 0),
      groups: rest,
    },
  };
}

/** Percentual arredondado de um valor no total (0 quando o total é 0). */
export const chartPercent = (value, total) =>
  total > 0 ? Math.round(((Number(value) || 0) / total) * 100) : 0;

/** Soma dos grupos que entram no gráfico (saldos positivos). */
export const chartTotal = (groups = []) =>
  groups.reduce((total, group) => total + Math.max(0, Number(group.value) || 0), 0);
