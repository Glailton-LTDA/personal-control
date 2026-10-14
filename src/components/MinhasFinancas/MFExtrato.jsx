import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, ArrowRight, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import {
  useMFStatement,
  useMFCategories,
  useUpdateMFTransaction,
  formatMoney,
  parseISODate,
  toISODate,
  currentMonthKey,
  mfInstallmentSuffix,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencyFilter from './MFCurrencyFilter';
import MFSelect from './MFSelect';
import MFCategoryAvatar from './MFCategoryAvatar';
import MFTransacaoScreen from './MFTransacaoScreen';
import MFTxDetailModal from './MFTxDetailModal';

/**
 * Extrato do mês: movimentações agrupadas com saldo corrente,
 * com filtros por conta e por moeda. O saldo corrente só é exibido
 * quando o escopo tem uma única moeda (nunca somamos moedas distintas).
 */
export default function MFExtrato({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
}) {
  const { t, i18n } = useTranslation();
  const [accountFilter, setAccountFilter] = useState('all');
  const [currency, setCurrency] = useState('all');
  // Detalhes do lançamento (resumo + menu ⋮; editar abre a tela).
  const [detailTx, setDetailTx] = useState(null);
  const [editing, setEditing] = useState(null);
  const [screenOpen, setScreenOpen] = useState(false);
  const { data, isLoading, isError, isFetching } = useMFStatement(
    user,
    monthKey,
    accountFilter === 'all' ? null : accountFilter,
    currency
  );
  // Recarregando em segundo plano (ex.: após criar um lançamento): avisa
  // com uma pílula discreta em vez de trocar a lista pelo "Carregando".
  const refreshing = isFetching && !isLoading;

  const money = (value, rowCurrency) => (showValues ? formatMoney(value, rowCurrency) : '•••');
  const mixed = !!data?.mixed;
  const { data: categories = [] } = useMFCategories(user);
  const categoryById = useMemo(
    () => Object.fromEntries((categories || []).map((row) => [row.id, row])),
    [categories]
  );
  const currencyOptions = [...new Set((data?.accounts ?? []).map((acc) => acc.currency || 'BRL'))];
  const accountOptions = (data?.accounts ?? []).filter(
    (acc) => currency === 'all' || (acc.currency || 'BRL') === currency
  );

  const handleCurrencyChange = (value) => {
    setCurrency(value);
    setAccountFilter('all'); // evita filtro de conta que não pertence à moeda escolhida
  };

  const formatDate = (iso) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(parseISODate(iso));

  const statusLabel = (status) =>
    t(`minhasfinancas.status_${String(status).toLowerCase()}`);

  const updateTx = useUpdateMFTransaction();

  /** Abre os Detalhes (busca os vínculos de tag direto). */
  const openTx = async (tx) => {
    let tagIds = [];
    try {
      const { data } = await supabase
        .from('mf_transaction_tags')
        .select('tag_id')
        .eq('transaction_id', tx.id);
      tagIds = (data ?? []).map((row) => row.tag_id);
    } catch {
      tagIds = [];
    }
    setDetailTx({ ...tx, tagIds });
  };

  /** Do modal Detalhes → tela completa de edição. */
  const openFullEdit = (tx) => {
    setDetailTx(null);
    setEditing(tx);
    setScreenOpen(true);
  };

  /** Efetiva um lançamento agendado (PENDENTE): o dinheiro saiu de fato. */
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

  const typeLabel = (tx) => {
    if (tx.type === 'TRANSFERENCIA') return t('minhasfinancas.statement_transfer');
    if (tx.type === 'RECEITA') return t('minhasfinancas.statement_income');
    return t('minhasfinancas.statement_expense');
  };

  const groups = data?.groups ?? [];
  const isEmpty = !isLoading && !isError && groups.length === 0;

  return (
    <div data-testid="mf-extrato" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            data-testid={refreshing ? 'mf-extrato-refreshing' : undefined}
            title={refreshing ? t('minhasfinancas.statement_updating') : undefined}
            style={{
              padding: '0.6rem',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            {refreshing ? <Loader2 size={22} className="animate-spin" /> : <Receipt size={22} />}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.statement')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.statement_desc')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <MFCurrencyFilter
            currencies={currencyOptions}
            value={currency}
            onChange={handleCurrencyChange}
          />
          <MFSelect
            testId="mf-statement-filter"
            value={accountFilter}
            onChange={setAccountFilter}
            placeholder={t('minhasfinancas.statement_all_accounts')}
            options={[
              { value: 'all', label: t('minhasfinancas.statement_all_accounts') },
              ...accountOptions.map((account) => ({
                value: account.id,
                label: account.name,
                meta: `(${account.currency || 'BRL'})`,
                color: account.color,
              })),
            ]}
            style={{ minWidth: 180, width: 'auto' }}
          />
          <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
        </div>
      </div>

      {isError && (
        <div className="glass-card" data-testid="mf-extrato-error" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{t('minhasfinancas.load_error')}</p>
        </div>
      )}

      {isLoading && (
        <div className="glass-card" data-testid="mf-extrato-loading" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('minhasfinancas.loading')}</p>
        </div>
      )}

      {isEmpty && (
        <div className="glass-card" data-testid="mf-extrato-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('minhasfinancas.statement_empty')}</p>
        </div>
      )}

      {!isLoading &&
        groups.map((group) => (
          <div key={group.date} className="glass-card" data-testid="mf-statement-day" style={{ padding: '1rem 1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '1rem',
                paddingBottom: '0.6rem',
                borderBottom: '1px solid var(--glass-border)',
                marginBottom: '0.4rem',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'capitalize' }}>
                {formatDate(group.date)}
              </span>
              {!mixed && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.statement_balance')}:{' '}
                  <strong style={{ color: 'var(--text-main)' }}>
                    {money(
                      group.items[group.items.length - 1]?.balance ?? 0,
                      group.items[group.items.length - 1]?.currency
                    )}
                  </strong>
                </span>
              )}
            </div>

            {group.items.map(({ tx, delta, accountName, transferAccountName, balance, currency: itemCurrency }) => {
              const isTransfer = tx.type === 'TRANSFERENCIA';
              const positive = delta > 0;
              const Icon = isTransfer ? ArrowRight : positive ? ArrowUpRight : ArrowDownRight;
              // Sinal da transferência relativo ao escopo do filtro de conta:
              // 'all' = transferência interna (neutra), senão entrada/saída da conta filtrada.
              const transferSign = isTransfer
                ? accountFilter === 'all'
                  ? '⇄'
                  : tx.transfer_account_id === accountFilter
                  ? '+'
                  : '−'
                : positive
                ? '+'
                : '−';
              const category = tx.category_id ? categoryById[tx.category_id] ?? null : null;
              return (
                <div
                  key={tx.id}
                  data-testid="mf-statement-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => openTx(tx)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openTx(tx);
                    }
                  }}
                  className="table-row-hover"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.9rem',
                    padding: '0.7rem 0',
                    borderBottom: '1px dashed var(--glass-border)',
                    cursor: 'pointer',
                  }}
                >
                  {category ? (
                    <span data-testid="mf-statement-avatar" style={{ display: 'inline-flex', flexShrink: 0 }}>
                      <MFCategoryAvatar category={category} size={36} />
                    </span>
                  ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background:
                        isTransfer && accountFilter === 'all'
                          ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                          : positive
                          ? 'rgba(16, 185, 129, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                      color:
                        isTransfer && accountFilter === 'all'
                          ? 'var(--primary)'
                          : positive
                          ? '#10b981'
                          : '#ef4444',
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{`${tx.description}${mfInstallmentSuffix(tx)}`}</p>
                    <p
                      style={{
                        margin: '0.15rem 0 0',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{typeLabel(tx)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {isTransfer
                          ? `${accountName} → ${transferAccountName}`
                          : accountName}
                      </span>
                      {tx.status !== 'PAGO' && (
                        <>
                          <span aria-hidden>·</span>
                          <span data-testid="mf-statement-pending" style={{ color: '#f59e0b' }}>
                            {statusLabel(tx.status)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p
                      data-testid="mf-statement-amount"
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        color:
                          isTransfer && accountFilter === 'all'
                            ? 'var(--text-main)'
                            : positive
                            ? '#10b981'
                            : '#ef4444',
                      }}
                    >
                      {transferSign} {money(Math.abs(Number(tx.amount) || 0), itemCurrency)}
                    </p>
                    {showValues && !mixed && (
                      <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t('minhasfinancas.statement_balance')}: {formatMoney(balance, itemCurrency)}
                      </p>
                    )}
                    {tx.status === 'PENDENTE' && (
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid="mf-statement-settle"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSettle(tx);
                        }}
                        style={{
                          marginTop: '0.35rem',
                          fontSize: '0.7rem',
                          padding: '0.3rem 0.65rem',
                        }}
                      >
                        {t('minhasfinancas.statement_efetivar')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      {/* Detalhes do lançamento (resumo + menu ⋮) */}
      {detailTx && (
        <MFTxDetailModal
          tx={detailTx}
          tagIds={detailTx.tagIds || []}
          user={user}
          onClose={() => setDetailTx(null)}
          onEditFull={openFullEdit}
        />
      )}
      {/* Tela completa de edição */}
      {screenOpen && (
        <MFTransacaoScreen
          tx={editing}
          user={user}
          accountScope="all"
          onClose={() => {
            setScreenOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
