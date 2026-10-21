import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { formatMoney, useMFPendingMonth, useMFAccounts } from '../../hooks/useMinhasFinancas';

/**
 * Card "Pendentes" do Resumo (MF).
 *
 * Janela: só o mês navegado — cada mês mostra os seus próprios
 * pendentes (sem grupo de atrasados). Lista todos, sem limite.
 * Faturas entram só as já agendadas como transação pendente (o
 * pagamento-espelho do cartão, com `invoice_close`) — fatura em aberto
 * sem agendamento fica de fora.
 * Clique no item abre o detalhe da transação (com o botão Efetivar,
 * igual ao Extrato).
 */

const FILTERS = [
  { id: 'all', key: 'all' },
  { id: 'despesa', key: 'pay' },
  { id: 'receita', key: 'recv' },
  { id: 'transferencia', key: 'trans' },
];

/** '2026-10' → 'out' (rótulo curto do mês, no idioma informado). */
const shortMonthLabel = (monthKey, language) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  return new Intl.DateTimeFormat(language, { month: 'short' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
};

/** '2026-10-15' → '15/10'. */
const shortDayLabel = (iso) => {
  const parts = String(iso || '').split('-');
  if (parts.length < 3) return '';
  return `${parts[2]}/${parts[1]}`;
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export default function MFPendingCard({ user, monthKey, onOpenTx, onSeeAll }) {
  const { t, i18n } = useTranslation();
  const { data: pending = [] } = useMFPendingMonth(user, monthKey);
  const { data: accounts = [] } = useMFAccounts(user);
  const [filter, setFilter] = useState('all');
  const [showValues = true] = useState(true);

  const accountsById = useMemo(
    () => Object.fromEntries((accounts ?? []).map((acc) => [acc.id, acc])),
    [accounts]
  );

  const rows = useMemo(
    () => (pending ?? []).filter((tx) => tx.status === 'PENDENTE'),
    [pending]
  );

  const totals = useMemo(() => {
    const acc = { pay: 0, recv: 0, trans: 0 };
    rows.forEach((tx) => {
      const amount = Math.abs(Number(tx.amount) || 0);
      if (tx.type === 'RECEITA') acc.recv += amount;
      else if (tx.type === 'TRANSFERENCIA') acc.trans += amount;
      else acc.pay += amount;
    });
    return { pay: round2(acc.pay), recv: round2(acc.recv), trans: round2(acc.trans) };
  }, [rows]);

  const counts = useMemo(() => {
    const acc = { all: rows.length, despesa: 0, receita: 0, transferencia: 0 };
    rows.forEach((tx) => {
      if (tx.type === 'RECEITA') acc.receita += 1;
      else if (tx.type === 'TRANSFERENCIA') acc.transferencia += 1;
      else acc.despesa += 1;
    });
    return acc;
  }, [rows]);

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? rows
        : rows.filter((tx) => (filter === 'despesa' ? tx.type === 'DESPESA' : tx.type === filter.toUpperCase())),
    [rows, filter]
  );

  const filteredTotal = useMemo(
    () => round2(filtered.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0)),
    [filtered]
  );

  const money = (value, currency) =>
    showValues ? formatMoney(value, currency) : '•••';

  const monthLabel = useMemo(() => {
    const parts = String(monthKey || '').split('-').map(Number);
    if (!parts[0] || !parts[1]) return '';
    return new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
      new Date(parts[0], parts[1] - 1, 1)
    );
  }, [monthKey, i18n.language]);

  const stats = [
    { id: 'pay', label: t('minhasfinancas.res_pending_pay'), value: totals.pay, color: '#ef4444' },
    { id: 'recv', label: t('minhasfinancas.res_pending_recv'), value: totals.recv, color: '#10b981' },
    { id: 'trans', label: t('minhasfinancas.res_pending_trans'), value: totals.trans, color: 'var(--primary)' },
  ];

  return (
    <div
      className="glass-card"
      data-testid="mf-resumo-pending-card"
      style={{
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        maxWidth: 560,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {t('minhasfinancas.res_pending_title')}
          <span
            data-testid="mf-resumo-pending-count"
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              color: 'var(--text-main)',
              background: 'var(--card-action-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 999,
              padding: '0.03rem 0.45rem',
            }}
          >
            {rows.length}
          </span>
        </strong>
        <button
          type="button"
          className="icon-btn"
          data-testid="mf-resumo-pending-see-all"
          aria-label={t('minhasfinancas.see_all')}
          onClick={() => onSeeAll?.()}
        >
          <ArrowRight size={15} />
        </button>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}
      >
        {stats.map((stat) => (
          <div
            key={stat.id}
            data-testid={`mf-resumo-pending-stat-${stat.id}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              padding: '0.45rem 0.55rem',
              borderRadius: 10,
              background: 'var(--input-bg)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: stat.value > 0 ? stat.color : 'var(--text-muted)',
                }}
              />
              {stat.label}
            </span>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                color: stat.value > 0 ? 'var(--text-main)' : 'var(--text-muted)',
              }}
            >
              {money(stat.value, 'BRL')}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {FILTERS.map((item) => {
          const active = filter === item.id;
          const count = counts[item.id] ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`mf-resumo-pending-pill-${item.id}`}
              onClick={() => setFilter(item.id)}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: 999,
                cursor: 'pointer',
                color: active ? '#fff' : 'var(--text-muted)',
                background: active ? 'var(--primary)' : 'transparent',
                border: `1px solid ${active ? 'var(--primary)' : 'var(--glass-border)'}`,
              }}
            >
              {t(`minhasfinancas.res_pending_filter_${item.key}`)} ({count})
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p
          data-testid="mf-resumo-pending-empty"
          style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
        >
          {t('minhasfinancas.res_pending_empty')}
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
            }}
          >
            {monthLabel}
            <span
              data-testid="mf-resumo-pending-group-total"
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-main)',
                background: 'var(--card-action-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '0.03rem 0.45rem',
              }}
            >
              {filtered.length} · {money(filteredTotal, 'BRL')}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p
              data-testid="mf-resumo-pending-empty-filter"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.res_pending_empty_filter')}
            </p>
          ) : (
            filtered.map((tx) => {
              const account = accountsById[tx.account_id];
              const currency = account?.currency || 'BRL';
              const amount = Number(tx.amount) || 0;
              const isExpense = tx.type !== 'RECEITA' && tx.type !== 'TRANSFERENCIA';
              const isTransfer = tx.type === 'TRANSFERENCIA';
              const icon = isTransfer ? '⇄' : isExpense ? '−' : '+';
              const color = isTransfer
                ? 'var(--text-muted)'
                : isExpense
                  ? '#ef4444'
                  : '#10b981';
              return (
                <button
                  key={tx.id}
                  type="button"
                  data-testid={`mf-resumo-pending-item-${tx.id}`}
                  onClick={() => onOpenTx?.(tx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    width: '100%',
                    padding: '0.4rem 0.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 30,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      lineHeight: 1.1,
                    }}
                  >
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                      {String(tx.payment_date || '').slice(8, 10)}
                    </span>
                    {shortMonthLabel(String(tx.payment_date || '').slice(0, 7), i18n.language)}
                  </span>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color,
                      background: 'var(--input-bg)',
                    }}
                  >
                    {icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.85rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tx.description || t('minhasfinancas.chart_uncategorized')}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {account?.name ? <span>{account.name}</span> : null}
                      {tx.invoice_close ? (
                        <span
                          data-testid={`mf-resumo-pending-fatura-${tx.id}`}
                          style={{
                            padding: '0.02rem 0.4rem',
                            borderRadius: 999,
                            border: '1px solid var(--glass-border)',
                            background: 'var(--card-action-bg)',
                          }}
                        >
                          🎴 {t('minhasfinancas.res_pending_fatura', {
                            date: shortDayLabel(tx.invoice_close),
                          })}
                        </span>
                      ) : null}
                      {tx.invoice_close ? (
                        <span
                          style={{
                            padding: '0.02rem 0.4rem',
                            borderRadius: 999,
                            border: '1px solid var(--glass-border)',
                          }}
                        >
                          {t('minhasfinancas.res_pending_due', {
                            date: shortDayLabel(tx.payment_date),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                      color,
                    }}
                  >
                    {isTransfer
                      ? money(amount, currency)
                      : `${isExpense ? '−' : '+'}${money(amount, currency)}`}
                  </span>
                </button>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
