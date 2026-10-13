import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFBudgets,
  useDeleteMFBudget,
  useMFBudgetWindow,
  useMFAccounts,
  useMFCategories,
  useMFTags,
  budgetSpent,
  budgetLimit,
  monthBounds,
  shiftMonth,
  formatMoney,
  currentMonthKey,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencySelect from './MFCurrencySelect';
import MFBudgetModal from './MFBudgetModal';

const HISTORY_MONTHS = 6;

/**
 * Tela de Orçamentos (Fase 5): limites por categoria/tag/conta/global
 * com progresso, histórico de 6 meses e alerta de estouro.
 * Sem cotação: a tela usa uma moeda por vez (seletor sem "todas").
 */
export default function MFOrcamentos({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
}) {
  const { t } = useTranslation();
  const { data: budgets = [] } = useMFBudgets(user);
  const { data: windowData } = useMFBudgetWindow(user, HISTORY_MONTHS);
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);
  const deleteMutation = useDeleteMFBudget();

  const [currency, setCurrency] = useState('BRL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const currencyOptions = useMemo(
    () => [...new Set(accounts.map((acc) => acc.currency || 'BRL'))],
    [accounts]
  );

  // Padrão: BRL; se não existir, primeira moeda das contas
  useEffect(() => {
    if (currencyOptions.length === 0) return;
    if (!currencyOptions.includes(currency)) {
      setCurrency(currencyOptions.includes('BRL') ? 'BRL' : currencyOptions[0]);
    }
  }, [currencyOptions, currency]);

  const transactions = useMemo(() => windowData?.transactions ?? [], [windowData]);
  const tagIdsByTx = useMemo(() => windowData?.tagIdsByTx ?? {}, [windowData]);

  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );
  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat.id, cat])),
    [categories]
  );
  const categoryById = categoriesById;
  const tagById = useMemo(() => Object.fromEntries(tags.map((tag) => [tag.id, tag])), [tags]);

  const month = monthBounds(monthKey);
  const monthStart = month.start;
  const monthEnd = month.end;

  const visibleBudgets = useMemo(
    () =>
      budgets.filter(
        (b) =>
          typeof b.period_start === 'string' &&
          typeof b.period_end === 'string' &&
          b.period_start <= monthEnd &&
          b.period_end >= monthStart
      ),
    [budgets, monthStart, monthEnd]
  );

  const computeBudget = (budget) => {
    const spent = budgetSpent({
      budget,
      transactions,
      tagIdsByTx,
      accountsById,
      categoriesById,
      currency,
    });
    const limit = budgetLimit({ budget, transactions, accountsById, currency });
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const history = [];
    for (let i = HISTORY_MONTHS - 1; i >= 0; i -= 1) {
      const key = shiftMonth(monthKey, -i);
      const bounds = monthBounds(key);
      const start = bounds.start > budget.period_start ? bounds.start : budget.period_start;
      const end = bounds.end < budget.period_end ? bounds.end : budget.period_end;
      const value =
        start <= end
          ? budgetSpent({
              budget: { ...budget, period_start: start, period_end: end },
              transactions,
              tagIdsByTx,
              accountsById,
              categoriesById,
              currency,
            })
          : 0;
      history.push({ key, value });
    }
    return { spent, limit, pct, breached: limit > 0 && spent > limit, history };
  };

  const items = useMemo(
    () => visibleBudgets.map((budget) => ({ budget, ...computeBudget(budget) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleBudgets, transactions, tagIdsByTx, accountsById, categoriesById, currency, monthKey]
  );

  const breaches = items.filter((item) => item.breached);
  const totalLimit = items.reduce((sum, item) => sum + item.limit, 0);
  const totalSpent = items.reduce((sum, item) => sum + item.spent, 0);

  const money = (value, cur = 'BRL') => (showValues ? formatMoney(value, cur) : '•••');

  const scopeLabel = (budget) => {
    if (budget.category_id) return categoryById[budget.category_id]?.name ?? '—';
    if (budget.tag_id) return `# ${tagById[budget.tag_id]?.name ?? '—'}`;
    if (budget.account_id) return accountsById[budget.account_id]?.name ?? '—';
    return t('minhasfinancas.bdg_scope_global');
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  const handleDelete = (budget) => {
    confirmToast(
      t('minhasfinancas.bdg_delete_confirm', { name: budget.name }),
      async () => {
        try {
          await deleteMutation.mutateAsync(budget.id);
          toast.success(t('minhasfinancas.bdg_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (budget) => {
    setEditing(budget);
    setModalOpen(true);
  };

  return (
    <div data-testid="mf-orcamentos" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabeçalho */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <PieChart size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.budgets')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.budgets_desc')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <MFCurrencySelect
            value={currency}
            onChange={setCurrency}
            currencies={currencyOptions}
            includeAll={false}
            label={t('minhasfinancas.currency_label')}
            testId="mf-bdg-currency"
            style={{ minWidth: 175 }}
          />
          <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-new-budget"
            onClick={openNew}
            style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.budget_new')}
          </button>
        </div>
      </div>

      {/* Alerta de estouro */}
      {breaches.length > 0 && (
        <div
          className="glass-card"
          data-testid="mf-budget-alert"
          style={{
            padding: '1rem 1.25rem',
            border: '1px solid color-mix(in srgb, #ef4444 45%, transparent)',
            background: 'color-mix(in srgb, #ef4444 8%, transparent)',
          }}
        >
          <p
            style={{
              margin: '0 0 0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 800,
              fontSize: '0.9rem',
              color: '#ef4444',
            }}
          >
            <AlertTriangle size={16} /> {t('minhasfinancas.bdg_alert_title')}
          </p>
          {breaches.map(({ budget, spent, limit }) => (
            <p
              key={budget.id}
              data-testid="mf-budget-alert-item"
              style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}
            >
              {budget.name}: <strong>{money(spent, currency)}</strong> / {money(limit, currency)}{' '}
              <span style={{ color: '#ef4444' }}>
                (+{money(spent - limit, currency)})
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Resumo */}
      {items.length > 0 && (
        <div className="glass-card" data-testid="mf-budget-summary" style={{ padding: '1rem 1.25rem', fontSize: '0.9rem' }}>
          <strong>{t('minhasfinancas.bdg_summary')}</strong>:{' '}
          <span data-testid="mf-budget-total-spent">{money(totalSpent, currency)}</span> /{' '}
          <span data-testid="mf-budget-total-limit">{money(totalLimit, currency)}</span>
        </div>
      )}

      {/* Vazio */}
      {items.length === 0 && (
        <div className="glass-card" data-testid="mf-budgets-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
            {t('minhasfinancas.bdg_empty')}
          </p>
          <button type="button" className="btn-primary" onClick={openNew} style={{ display: 'inline-flex' }}>
            <Plus size={16} />
            {t('minhasfinancas.budget_new')}
          </button>
        </div>
      )}

      {/* Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {items.map(({ budget, spent, limit, pct, breached, history }) => {
          const barColor = breached ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
          const historyMax = Math.max(limit, ...history.map((h) => h.value), 1);
          return (
            <div
              key={budget.id}
              className="glass-card"
              data-testid="mf-budget-card"
              style={{
                padding: '1.1rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                border: breached
                  ? '1px solid color-mix(in srgb, #ef4444 50%, transparent)'
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <strong style={{ fontSize: '0.98rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {budget.name}
                  </strong>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 6,
                      padding: '0.05rem 0.4rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {scopeLabel(budget)}
                  </span>
                </div>
                <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-bdg-edit-${budget.id}`}
                    aria-label={t('minhasfinancas.edit')}
                    onClick={() => openEdit(budget)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-bdg-del-${budget.id}`}
                    aria-label={t('minhasfinancas.delete')}
                    onClick={() => handleDelete(budget)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {formatDate(budget.period_start)} – {formatDate(budget.period_end)}
                {budget.mode === 'PERCENT'
                  ? ` · ${t('minhasfinancas.bdg_percent_income_hint', {
                      percent: budget.percent_of_income,
                    })}`
                  : ''}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: barColor }} data-testid="mf-budget-spent">
                  {money(spent, currency)}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.bdg_of')} <span data-testid="mf-budget-limit">{money(limit, currency)}</span>
                </span>
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--input-bg)',
                  overflow: 'hidden',
                }}
              >
                <div
                  data-testid="mf-budget-progress"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    height: '100%',
                    background: barColor,
                    transition: 'width 0.3s',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: barColor }} data-testid="mf-budget-pct">
                  {t('minhasfinancas.bdg_pct', { pct: Math.round(pct) })}
                </span>
                {breached && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: '#ef4444',
                      border: '1px solid color-mix(in srgb, #ef4444 40%, transparent)',
                      background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                      borderRadius: 999,
                      padding: '0.1rem 0.5rem',
                    }}
                  >
                    {t('minhasfinancas.bdg_breached')}
                  </span>
                )}
              </div>

              {/* Histórico 6 meses */}
              <div data-testid="mf-budget-history" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44, marginTop: '0.2rem' }}>
                {history.map((item) => (
                  <div
                    key={item.key}
                    title={`${item.key}: ${showValues ? formatMoney(item.value, currency) : ''}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(4, (item.value / historyMax) * 100)}%`,
                      borderRadius: 4,
                      background:
                        item.value > limit && limit > 0
                          ? '#ef4444'
                          : 'color-mix(in srgb, var(--primary) 55%, transparent)',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('minhasfinancas.bdg_history')}
              </div>
            </div>
          );
        })}
      </div>

      <MFBudgetModal
        isOpen={modalOpen}
        budget={editing}
        user={user}
        monthKey={monthKey}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
