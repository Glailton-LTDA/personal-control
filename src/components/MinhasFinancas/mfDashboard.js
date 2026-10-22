/**
 * Painel personalizável do Resumo (Fase 9 — adiado da Fase 6).
 *
 * Preferência: `{ order, hidden, hiddenAccounts, hiddenCharts }`.
 * - `order`: ordem de exibição dos widgets (ids conhecidos);
 * - `hidden`: widgets ocultados pelo usuário;
 * - `hiddenAccounts`: contas que NÃO aparecem no painel (KPIs, tabela e
 *   gráficos seguem essa seleção). Lista vazia = todas visíveis;
 * - `hiddenCharts`: gráficos ocultados dentro do widget "charts" (Fase D).
 *
 * A camada de armazenamento (localStorage + sincronização com a conta)
 * mora em `src/lib/mfPrefs.js`; aqui ficam só as operações de
 * preferência. Os símbolos de lá são reexportados para não quebrar os
 * imports existentes.
 */
import {
  MF_DASHBOARD_KEY,
  MF_DASHBOARD_WIDGETS,
  MF_CHARTS,
  normalizeWidgetPref,
  loadWidgetPref,
  saveWidgetPref,
} from '../../lib/mfPrefs';

export {
  MF_DASHBOARD_KEY,
  MF_DASHBOARD_WIDGETS,
  MF_CHARTS,
  normalizeWidgetPref,
  loadWidgetPref,
  saveWidgetPref,
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
