import { describe, it, expect, beforeEach } from 'vitest';
import {
  MF_DASHBOARD_WIDGETS,
  MF_DASHBOARD_KEY,
  normalizeWidgetPref,
  visibleWidgets,
  toggleWidget,
  moveWidget,
  toggleAccountVisible,
  setHiddenAccounts,
  loadWidgetPref,
  saveWidgetPref,
} from './mfDashboard';

describe('normalizeWidgetPref', () => {
  it('preferência nula/inexistente vira a ordem padrão (tudo visível)', () => {
    expect(normalizeWidgetPref(null)).toEqual({
      order: [...MF_DASHBOARD_WIDGETS],
      hidden: [],
      hiddenAccounts: [],
    });
    expect(normalizeWidgetPref('não é json {')).toEqual({
      order: [...MF_DASHBOARD_WIDGETS],
      hidden: [],
      hiddenAccounts: [],
    });
    expect(normalizeWidgetPref({ order: 'x', hidden: 1, hiddenAccounts: 'y' })).toEqual({
      order: [...MF_DASHBOARD_WIDGETS],
      hidden: [],
      hiddenAccounts: [],
    });
  });

  it('respeita a ordem salva, descarta ids desconhecidos e re-insere os novos', () => {
    const pref = normalizeWidgetPref(
      JSON.stringify({ order: ['goals', 'fantasma', 'kpis'], hidden: ['kpis', 'outro'] })
    );
    expect(pref.order).toEqual(['goals', 'kpis', 'groups', 'accounts', 'charts', 'budgets']);
    expect(pref.hidden).toEqual(['kpis']);
    expect(pref.hiddenAccounts).toEqual([]);
  });

  it('deduplica ids repetidos', () => {
    const pref = normalizeWidgetPref(
      JSON.stringify({ order: ['accounts', 'accounts'], hidden: ['goals', 'goals'] })
    );
    expect(pref.order).toEqual(['accounts', 'charts', 'budgets', 'goals', 'kpis', 'groups']);
    expect(pref.hidden).toEqual(['goals']);
  });

  it('widget novo entra na posição do vizinho da ordem padrão (groups ACIMA de accounts)', () => {
    // Preferência salva por versões antigas, sem o widget "groups".
    const pref = normalizeWidgetPref(
      JSON.stringify({
        order: ['kpis', 'accounts', 'charts', 'budgets', 'goals'],
        hidden: [],
      })
    );
    expect(pref.order).toEqual([
      'kpis',
      'groups',
      'accounts',
      'charts',
      'budgets',
      'goals',
    ]);
  });

  it('mantém contas ocultas válidas e descarta as inválidas', () => {
    const pref = normalizeWidgetPref(
      JSON.stringify({ hiddenAccounts: ['acc-1', 'acc-1', 42, null, ''] })
    );
    expect(pref.hiddenAccounts).toEqual(['acc-1']);
  });
});

describe('visibleWidgets', () => {
  it('remove as ocultas mantendo a ordem', () => {
    const pref = { order: ['goals', 'kpis', 'accounts'], hidden: ['kpis'] };
    expect(visibleWidgets(pref)).toEqual(['goals', 'accounts']);
  });
});

describe('toggleWidget', () => {
  it('oculta e volta a mostrar sem alterar a ordem', () => {
    const pref = { order: ['kpis', 'accounts'], hidden: [] };
    const hidden = toggleWidget(pref, 'accounts');
    expect(hidden).toEqual({ order: ['kpis', 'accounts'], hidden: ['accounts'] });
    expect(toggleWidget(hidden, 'accounts')).toEqual({
      order: ['kpis', 'accounts'],
      hidden: [],
    });
  });
});

describe('moveWidget', () => {
  it('sobe e desce trocando posições', () => {
    const pref = { order: ['kpis', 'accounts', 'budgets'], hidden: [] };
    expect(moveWidget(pref, 'budgets', -1).order).toEqual(['kpis', 'budgets', 'accounts']);
    expect(moveWidget(pref, 'kpis', 1).order).toEqual(['accounts', 'kpis', 'budgets']);
  });

  it('limites devolvem o MESMO objeto (sem estado novo)', () => {
    const pref = { order: ['kpis', 'accounts'], hidden: [] };
    expect(moveWidget(pref, 'kpis', -1)).toBe(pref);
    expect(moveWidget(pref, 'accounts', 1)).toBe(pref);
    expect(moveWidget(pref, 'nao-existe', 1)).toBe(pref);
  });
});

describe('toggleAccountVisible / setHiddenAccounts', () => {
  it('alterna uma conta entre visível e oculta', () => {
    const pref = { order: [...MF_DASHBOARD_WIDGETS], hidden: [], hiddenAccounts: [] };
    const hidden = toggleAccountVisible(pref, 'acc-9');
    expect(hidden.hiddenAccounts).toEqual(['acc-9']);
    expect(toggleAccountVisible(hidden, 'acc-9').hiddenAccounts).toEqual([]);
  });

  it('define as ocultas de uma vez (ações Todas/Nenhuma) e deduplica', () => {
    const pref = { order: [...MF_DASHBOARD_WIDGETS], hidden: [], hiddenAccounts: [] };
    expect(setHiddenAccounts(pref, ['a', 'b', 'a']).hiddenAccounts).toEqual(['a', 'b']);
    expect(setHiddenAccounts(pref, []).hiddenAccounts).toEqual([]);
  });
});

describe('load/save (localStorage)', () => {
  beforeEach(() => {
    localStorage.removeItem(MF_DASHBOARD_KEY);
  });

  it('round-trip: salvar e recarregar mantém a configuração', () => {
    const pref = {
      order: ['budgets', 'kpis', 'accounts', 'groups', 'charts', 'goals'],
      hidden: ['goals'],
      hiddenAccounts: ['acc-9'],
    };
    saveWidgetPref(pref);
    expect(loadWidgetPref()).toEqual(pref);
  });

  it('JSON corrompido no storage cai no padrão', () => {
    localStorage.setItem(MF_DASHBOARD_KEY, '{corrompido');
    expect(loadWidgetPref()).toEqual({
      order: [...MF_DASHBOARD_WIDGETS],
      hidden: [],
      hiddenAccounts: [],
    });
  });
});
