import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNotificationSettings } from '../../hooks/useFinance';
import {
  useMFStatement,
  computeStatement,
  useMFCategories,
  useUpdateMFTransaction,
  useMFSendReceiptEmail,
  formatMoney,
  parseISODate,
  toISODate,
  monthBounds,
  mfInstallmentSuffix,
} from '../../hooks/useMinhasFinancas';
import MFCategoryAvatar from './MFCategoryAvatar';
import MFEmailModal from './MFEmailModal';
import { mfNormalize } from './MFCategoryIcons';

/**
 * Extrato em timeline (padrão do app original): grupos por dia (mais
 * recente primeiro), trilho vertical, bolha da categoria, Efetivar nos
 * pendentes e linhas de Saldo/Saldo inicial com saldo corrente. Os dados
 * (grupos + saldo por item + abertura) vêm do useMFStatement.
 */
/**
 * Extrato em timeline (padrão do app original): grupos por dia (mais
 * recente primeiro), trilho vertical, bolha da categoria, Efetivar nos
 * pendentes e linhas de Saldo/Saldo inicial com saldo corrente.
 *
 * Dados: ou via `transactions`+`accounts` pré-carregados (detalhe: reusa
 * o `allTx` — trocar de mês vira instantâneo, sem baixar o histórico de
 * novo), ou via `useMFStatement` (tela de Extrato).
 */
export default function MFStatementTimeline({
  account,
  user,
  monthKey,
  showValues = true,
  onOpenTx = null,
  transactions = null,
  accounts = [],
  txLoading = false,
  txError = null,
  onRetry = null,
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const preloaded = Array.isArray(transactions);
  const statementQuery = useMFStatement(user, monthKey, account.id, account.currency || 'BRL', {
    enabled: !preloaded,
  });
  const { start, end } = monthBounds(monthKey);
  const computed = useMemo(
    () =>
      preloaded
        ? computeStatement({
            accounts,
            transactions,
            start,
            end,
            accountId: account.id,
            currency: account.currency || 'BRL',
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preloaded, accounts, transactions, monthKey, account.id, account.currency]
  );
  const data = preloaded ? computed : statementQuery.data;
  const isLoading = preloaded ? txLoading : statementQuery.isLoading;
  const isError = preloaded ? !!txError : statementQuery.isError;
  const handleRetry = () => {
    if (onRetry) onRetry();
    else statementQuery.refetch();
  };
  const { data: categories = [] } = useMFCategories(user);
  const updateTx = useUpdateMFTransaction();
  const sendReceipt = useMFSendReceiptEmail();
  const { data: notificationSettings } = useNotificationSettings();
  const [emailTarget, setEmailTarget] = useState(null);

  /** Enviar comprovante: direto se pula o modal, senão abre a escolha. */
  const openEmail = (tx, categoryName) => {
    if (notificationSettings?.skip_email_modal && notificationSettings?.recipient_email) {
      sendReceipt({ tx, categoryName });
    } else {
      setEmailTarget({ tx, categoryName });
    }
  };

  const categoryById = useMemo(
    () => Object.fromEntries((categories || []).map((row) => [row.id, row])),
    [categories]
  );

  const money = (value, rowCurrency) =>
    showValues ? formatMoney(value, rowCurrency) : '•••';

  const formatDay = (iso) => {
    const date = parseISODate(iso);
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date);
    return `${date.getDate()} • ${weekday}`;
  };

  /** Efetiva um lançamento agendado (PENDENTE) — igual ao Extrato. */
  const handleSettle = async (tx) => {
    try {
      await updateTx.mutateAsync({
        id: tx.id,
        status: 'PAGO',
        effective_date: tx.effective_date || toISODate(new Date()),
      });
      toast.success(t('minhasfinancas.tx_marked_paid'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const searching = mfNormalize(search).trim() !== '';
  const days = useMemo(() => {
    const groups = [...(data?.groups ?? [])].reverse(); // mais recente primeiro
    if (!searching) return groups;
    const needle = mfNormalize(search).trim();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const category = item.tx.category_id
            ? categoryById[item.tx.category_id]?.name ?? ''
            : '';
          const counterpart =
            item.tx.type === 'TRANSFERENCIA'
              ? item.transferAccountName ?? ''
              : '';
          return mfNormalize(
            `${item.tx.description ?? ''} ${category} ${counterpart}`
          ).includes(needle);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [data, searching, search, categoryById]);

  const opening = Number(data?.opening) || 0;

  return (
    <div data-testid="mf-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <input
        type="text"
        className="glass-input"
        data-testid="mf-timeline-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('minhasfinancas.timeline_search')}
        style={{ width: '100%', padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
      />

      {isLoading ? (
        <div
          data-testid="mf-timeline-loading"
          aria-label={t('minhasfinancas.loading')}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton" style={{ height: 84, borderRadius: 12 }} />
          ))}
        </div>
      ) : isError ? (
        <div
          data-testid="mf-timeline-error"
          style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}
        >
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            {t('minhasfinancas.load_error')}
          </p>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-timeline-retry"
            onClick={() => handleRetry()}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }}
          >
            {t('minhasfinancas.retry')}
          </button>
        </div>
      ) : days.length === 0 ? (
        <p
          data-testid="mf-timeline-empty"
          style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}
        >
          {t(searching ? 'minhasfinancas.timeline_no_results' : 'minhasfinancas.chart_no_data')}
        </p>
      ) : (
        <div style={{ borderLeft: '2px solid var(--glass-border)', paddingLeft: '0.9rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {days.map((group) => (
            <section key={group.date} data-testid={`mf-timeline-day-${group.date}`}>
              <p
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {formatDay(group.date)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {group.items.map(({ tx, currency: itemCurrency, accountName, transferAccountName }) => {
                  const amount = Number(tx.amount) || 0;
                  const signed =
                    tx.type === 'TRANSFERENCIA'
                      ? tx.account_id === account.id
                        ? -amount
                        : amount
                      : tx.type === 'RECEITA'
                        ? amount
                        : -amount;
                  const color =
                    signed > 0 ? '#10b981' : signed < 0 ? '#ef4444' : 'var(--text-muted)';
                  const category = tx.category_id
                    ? categoryById[tx.category_id] ?? null
                    : null;
                  const isTransfer = tx.type === 'TRANSFERENCIA';
                  const subtitle = isTransfer
                    ? tx.account_id === account.id
                      ? `→ ${transferAccountName ?? ''}`
                      : `← ${accountName ?? ''}`
                    : category?.name ?? '';
                  const body = (
                    <>
                      <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                        {category ? (
                          <MFCategoryAvatar category={category} size={34} />
                        ) : isTransfer ? (
                          <span
                            aria-hidden="true"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background:
                                'color-mix(in srgb, var(--primary) 14%, transparent)',
                              color: 'var(--primary)',
                            }}
                          >
                            <ArrowLeftRight size={15} />
                          </span>
                        ) : (
                          <MFCategoryAvatar category={null} size={34} />
                        )}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {`${tx.description || '—'}${mfInstallmentSuffix(tx)}`}
                        </span>
                        {subtitle && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {subtitle}
                          </span>
                        )}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              color,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {money(signed, itemCurrency)}
                          </span>
                          <button
                            type="button"
                            className="icon-btn"
                            data-testid={`mf-timeline-email-${tx.id}`}
                            aria-label={t('minhasfinancas.email_send')}
                            title={t('minhasfinancas.email_send')}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEmail(tx, category?.name ?? '');
                            }}
                            style={{
                              padding: '0.25rem',
                              color: tx.email_sent ? 'var(--primary)' : 'var(--text-muted)',
                            }}
                          >
                            <Send size={13} />
                          </button>
                        </span>
                        {tx.status === 'PENDENTE' && (
                          <button
                            type="button"
                            className="btn-primary"
                            data-testid={`mf-timeline-settle-${tx.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSettle(tx);
                            }}
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.25rem 0.6rem',
                            }}
                          >
                            {t('minhasfinancas.statement_efetivar')}
                          </button>
                        )}
                      </span>
                    </>
                  );
                  return onOpenTx ? (
                    <div
                      role="button"
                      tabIndex={0}
                      key={tx.id}
                      data-testid={`mf-timeline-item-${tx.id}`}
                      onClick={() => onOpenTx(tx)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenTx(tx);
                        }
                      }}
                      className="table-row-hover"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.7rem',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'inherit',
                        font: 'inherit',
                      }}
                    >
                      {body}
                    </div>
                  ) : (
                    <div
                      key={tx.id}
                      data-testid={`mf-timeline-item-${tx.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
              {!searching && (
                <p
                  data-testid={`mf-timeline-balance-${group.date}`}
                  style={{
                    margin: '0.5rem 0 0 42px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ flex: 1 }}>{t('minhasfinancas.statement_balance')}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(group.items[group.items.length - 1].balance, account.currency)}
                  </strong>
                </p>
              )}
            </section>
          ))}
          {!searching && (
            <p
              data-testid="mf-timeline-opening"
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'inline-block',
                }}
              />
              <span style={{ flex: 1 }}>{t('minhasfinancas.accounts_table_initial')}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums', color: '#10b981' }}>
                {money(opening, account.currency)}
              </strong>
            </p>
          )}
        </div>
      )}
      {emailTarget && (
        <MFEmailModal
          tx={emailTarget.tx}
          categoryName={emailTarget.categoryName}
          onClose={() => setEmailTarget(null)}
        />
      )}
    </div>
  );
}
