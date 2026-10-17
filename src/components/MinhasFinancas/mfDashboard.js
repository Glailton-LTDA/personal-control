/**
 * Painel personalizável do Resumo (Fase 9 — adiado da Fase 6).
 *
 * Preferência em localStorage: `{ order, hidden, hiddenAccounts, hiddenCharts }`.
 * - `order`: ordem de exibição dos widgets (ids conhecidos);
 * - `hidden`: widgets ocultados pelo usuário;
 * - `hiddenAccounts`: contas que NÃO aparecem no painel (KPIs, tabela e
 *   gráficos seguem essa seleção). Lista vazia = todas visíveis;
 * - `hiddenCharts`: gráficos ocultados dentro do widget "charts" (Fase D).
 * Ids desconhecidos são descartados e widgets novos entram logo APÓS o
 * vizinho da ordem padrão (ex.: "groups" aparece logo abaixo de "kpis",
 * ACIMA de "accounts"), visíveis por padrão (migração automática entre
 * versões).
 */

export const MF_DASHBOARD_WIDGETS = ['kpis', 'groups', 'accounts', 'recent', 'charts', 'budgets', 'goals'];

/**
 * Gráficos do widget "charts" (Fase D) — cada um pode ser ocultado à parte.
 * Ordem de exibição; todos visíveis por padrão.
 */
export const MF_CHARTS = ['chart_categories', 'chart_flow', 'chart_income', 'chart_bytype'];

export const MF_DASHBOARD_KEY = 'mf_dashboard_widgets';

/** Normaliza uma preferência vinda de JSON/strings inválidas. */
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

/** Widgets visíveis na ordem configurada. */
export const visibleWidgets = (pref) =>
  pref.order.filter((id) => !pref.hidden.includes(id));

/** Gráficos visíveis na ordem configurada. */
export const visibleCharts = (pref) =>
  MF_CHARTS.filter((id) => !(pref.hiddenCharts ?? []).includes(id));

/** Alterna a visibilidade de um gráfico (Fase D). */
export const toggleChart = (pref, id) => ({
  ...pref,
  hiddenCharts: (pref.hiddenCharts ?? []).includes(id)
    ? (pref.hiddenCharts ?? []).filter((item) => item !== id)
    : [...(pref.hiddenCharts ?? []), id],
});

/** Alterna a visibilidade de um widget. */
export const toggleWidget = (pref, id) => ({
  ...pref,
  hidden: pref.hidden.includes(id)
    ? pref.hidden.filter((item) => item !== id)
    : [...pref.hidden, id],
});

/**
 * Move um widget na ordem (delta -1 sobe, +1 desce).
 * Fora de limite devolve o MESMO objeto (sem rerender à toa).
 */
export const moveWidget = (pref, id, delta) => {
  const index = pref.order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= pref.order.length) return pref;
  const order = [...pref.order];
  order.splice(index, 1);
  order.splice(target, 0, id);
  return { ...pref, order };
};

/** Alterna a visibilidade de uma conta no painel. */
export const toggleAccountVisible = (pref, id) => ({
  ...pref,
  hiddenAccounts: (pref.hiddenAccounts || []).includes(id)
    ? (pref.hiddenAccounts || []).filter((item) => item !== id)
    : [...(pref.hiddenAccounts || []), id],
});

/** Define de uma vez as contas ocultas (ex.: ações "Todas"/"Nenhuma"). */
export const setHiddenAccounts = (pref, ids) => ({
  ...pref,
  hiddenAccounts: [...new Set(ids)],
});

/** Lê a preferência do localStorage (seguro contra ausência/JSON inválido). */
export const loadWidgetPref = () => {
  if (typeof localStorage === 'undefined') return normalizeWidgetPref(null);
  return normalizeWidgetPref(localStorage.getItem(MF_DASHBOARD_KEY));
};

/** Persiste a preferência (falhas de quota/storage são ignoradas). */
export const saveWidgetPref = (pref) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MF_DASHBOARD_KEY, JSON.stringify(pref));
  } catch {
    /* storage indisponível — preferência vale só para a sessão */
  }
};
