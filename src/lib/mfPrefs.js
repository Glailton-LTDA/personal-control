/**
 * Preferências de interface do Minhas Finanças.
 *
 * Duas camadas:
 * - o localStorage (cache instantâneo, funciona offline) — o que o app
 *   lia até agora;
 * - a conta do usuário (tabela `mf_user_prefs`) — o servidor é a fonte
 *   da verdade, para o painel ser o MESMO em todos os aparelhos (celular,
 *   tablet, desktop), em vez de um layout por navegador.
 *
 * O que sincroniza: o painel do Resumo (ordem dos widgets, widgets,
 * contas e gráficos ocultos) e o critério de ordenação das contas. O
 * perfil ativo e o mês navegado ficam locais de propósito — cada
 * aparelho pode estar num perfil/mês diferente ao mesmo tempo.
 */

/** Widgets do painel do Resumo (ordem padrão). */
export const MF_DASHBOARD_WIDGETS = [
  'kpis',
  'groups',
  'accounts',
  'recent',
  'pending',
  'charts',
  'budgets',
  'goals',
];

/** Gráficos do widget "charts" — cada um pode ser ocultado à parte. */
export const MF_CHARTS = ['chart_categories', 'chart_flow', 'chart_income', 'chart_bytype'];

export const MF_DASHBOARD_KEY = 'mf_dashboard_widgets';
export const MF_ACCOUNTS_SORT_KEY = 'mf_accounts_sort';

/**
 * Normaliza uma preferência vinda de JSON/strings inválidas.
 * Ids desconhecidos são descartados e widgets novos entram logo APÓS o
 * vizinho da ordem padrão que já existir na preferência salva (ex.:
 * "groups" aparece logo abaixo de "kpis", ACIMA de "accounts", e
 * "pending" — o card de Pendentes — logo abaixo de "recent"), visíveis
 * por padrão (migração automática entre versões).
 */
export const normalizeWidgetPref = (raw) => {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const known = new Set(MF_DASHBOARD_WIDGETS);
  const savedOrder = Array.isArray(parsed?.order)
    ? [...new Set(parsed.order.filter((id) => known.has(id)))]
    : [];
  // Widget novo: insere logo após o vizinho anterior da ordem padrão que
  // já existir na preferência salva (fallback: no fim). Assim "groups"
  // surge logo abaixo de "kpis" — ACIMA de "accounts" — em vez de no
  // rodapé da tela.
  const order = [...savedOrder];
  for (const id of MF_DASHBOARD_WIDGETS) {
    if (order.includes(id)) continue;
    const position = MF_DASHBOARD_WIDGETS.indexOf(id);
    let insertAt = order.length;
    for (let prev = position - 1; prev >= 0; prev -= 1) {
      const at = order.indexOf(MF_DASHBOARD_WIDGETS[prev]);
      if (at >= 0) {
        insertAt = at + 1;
        break;
      }
    }
    order.splice(insertAt, 0, id);
  }
  const hidden = Array.isArray(parsed?.hidden)
    ? [...new Set(parsed.hidden.filter((id) => known.has(id)))]
    : [];
  const hiddenAccounts = Array.isArray(parsed?.hiddenAccounts)
    ? [...new Set(parsed.hiddenAccounts.filter((id) => typeof id === 'string' && id))]
    : [];
  const knownCharts = new Set(MF_CHARTS);
  const hiddenCharts = Array.isArray(parsed?.hiddenCharts)
    ? [...new Set(parsed.hiddenCharts.filter((id) => knownCharts.has(id)))]
    : [];
  return { order, hidden, hiddenAccounts, hiddenCharts };
};

/** Lê a preferência do painel (localStorage; seguro contra JSON inválido). */
export const loadWidgetPref = () => {
  if (typeof localStorage === 'undefined') return normalizeWidgetPref(null);
  return normalizeWidgetPref(localStorage.getItem(MF_DASHBOARD_KEY));
};

/** Persiste a preferência do painel (falhas de quota/storage são ignoradas). */
export const saveWidgetPref = (pref) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MF_DASHBOARD_KEY, JSON.stringify(pref));
  } catch {
    /* storage indisponível — preferência vale só para a sessão */
  }
};

/** Critério de ordenação das contas no Resumo. */
export const readAccountsSort = () => {
  if (typeof localStorage === 'undefined') return 'manual';
  try {
    return localStorage.getItem(MF_ACCOUNTS_SORT_KEY) || 'manual';
  } catch {
    return 'manual';
  }
};

export const saveAccountsSort = (value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MF_ACCOUNTS_SORT_KEY, value);
  } catch {
    /* storage indisponível */
  }
};

/** Preferências completas do cache local. */
export const readPrefsLocal = () => ({
  dashboard: loadWidgetPref(),
  accountsSort: readAccountsSort(),
});

/** Grava as preferências no cache local (o servidor recebe em seguida). */
export const writePrefsLocal = (data) => {
  if (data?.dashboard) saveWidgetPref(data.dashboard);
  if (data?.accountsSort) saveAccountsSort(data.accountsSort);
};
