import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Wallet, Archive, ArchiveRestore, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMFAccounts,
  useMFAccountTransactions,
  useMFMonthSummary,
  useUpdateAccount,
  buildCardInvoices,
  formatMoney,
  formatMonthLabel,
  currencyFlag,
  currentMonthKey,
  monthRefISO,
} from '../../hooks/useMinhasFinancas';
import MFCurrencyFilter from './MFCurrencyFilter';
import MFAccountIcon from './MFAccountIcon';
import MFAccountModal from './MFAccountModal';
import MFPaymentModal from './MFPaymentModal';
import MFAccountDetail from './MFAccountDetail';
import MFMonthNav from './MFMonthNav';
import MFCardBrandIcon from './MFCardBrandIcon';
import { readMonthKey, writeMonthKey, readDrill, writeDrill } from './mfViewState';
import { mfCardUsagePct, mfCardBarColor } from './mfCardUsage';

const metricLabel = {
  display: 'block',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  marginBottom: '0.15rem',
};

const badgeChip = {
  fontSize: '0.64rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  padding: '0.1rem 0.5rem',
  color: 'var(--text-muted)',
};

/**
 * Tela de Cartões: grade de "cards" (limite, uso com barra, conta vinculada,
 * fechamento/vencimento e fatura corrente com ação de antecipar/pagar).
 * Clique no nome abre o drill-doown do cartão (lançamentos + faturas),
 * com edição/arquivamento no próprio widget.
 */
export default function MFCartoes({ user, showValues = true }) {
  const { t, i18n } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  // Escopo enxuto: cartões + vinculadas (o que a tela calcula).
  const cardScopeIds = (accounts ?? []).flatMap((row) =>
    row.account_type === 'CARTAO' ? [row.id, row.linked_account_id] : []
  );
  const { data: transactions = [] } = useMFAccountTransactions(user, null, cardScopeIds);
  const updateAccount = useUpdateAccount();

  const [currency, setCurrency] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(null); // { card, invoice } — modal de pagamento
  const [monthKey, setMonthKey] = useState(() => readMonthKey(currentMonthKey()));
  useEffect(() => {
    writeMonthKey(monthKey);
  }, [monthKey]);

  const { data: summary } = useMFMonthSummary(user, monthKey);
  const summaryRows = useMemo(() => summary?.rows ?? [], [summary]);

  const cards = useMemo(
    () =>
      accounts.filter(
        (acc) => acc.account_type === 'CARTAO' && (showArchived || !acc.archived_at)
      ),
    [accounts, showArchived]
  );
  const visibleCards = useMemo(
    () => (currency === 'all' ? cards : cards.filter((c) => (c.currency || 'BRL') === currency)),
    [cards, currency]
  );

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );

  // Linha do resumo mantida durante a troca de mês (padrão do MFContas).
  const lastSelectedRef = useRef(null);
  const foundSelected = selectedId ? summaryRows.find((row) => row.id === selectedId) : null;
  useEffect(() => {
    if (foundSelected) lastSelectedRef.current = foundSelected;
  }, [foundSelected]);
  const selectedRow = selectedId
    ? foundSelected || lastSelectedRef.current || null
    : null;

  // Drill-down sobrevive ao F5: grava ao abrir, limpa ao fechar e
  // restaura uma vez (quando as linhas chegam) se a conta existir.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (selectedId) {
      writeDrill({ tab: 'cards', id: selectedId });
      return;
    }
    if (restoredRef.current) {
      writeDrill(null);
      return;
    }
    if (summaryRows.length === 0) return;
    restoredRef.current = true;
    const saved = readDrill();
    if (saved?.tab === 'cards' && saved?.id && summaryRows.some((row) => row.id === saved.id)) {
      setSelectedId(saved.id);
    }
  }, [selectedId, summaryRows]);

  const editingCard = editingId ? accountById[editingId] || null : null;

  // Referência do mês: "hoje" no mês atual (fatura viva) e o fim do mês nos
  // demais — fatura corrente/em aberto acompanham a navegação de mês.
  const refISO = monthRefISO(monthKey);

  const money = (value, cardCurrency) =>
    showValues ? formatMoney(value, cardCurrency || 'BRL') : '•••';

  /** Abre o modal de pagamento da fatura corrente (valor total ou parcial). */
  const handlePayCurrent = (item, invoice) => {
    if (!item.linked_account_id) {
      toast.error(t('minhasfinancas.card_link_required'));
      return;
    }
    setPaying({ card: item, invoice });
  };

  /** Arquiva/restaura o cartão (histórico de faturas preservado). */
  const handleArchiveCard = async (item) => {
    const archiving = !item.archived_at;
    try {
      await updateAccount.mutateAsync({
        id: item.id,
        archived_at: archiving ? new Date().toISOString() : null,
      });
      toast.success(t(archiving ? 'minhasfinancas.archived_done' : 'minhasfinancas.unarchived_done'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  return (
    <div data-testid="mf-cartoes" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <CreditCard size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.cards')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.cards_desc')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <MFMonthNav monthKey={monthKey} onChange={setMonthKey} />
          <MFCurrencyFilter
            currencies={[...new Set(cards.map((c) => c.currency || 'BRL'))]}
            value={currency}
            onChange={setCurrency}
          />
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-cards-show-archived"
            aria-pressed={showArchived}
            onClick={() => setShowArchived((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 0.95rem',
              fontSize: '0.82rem',
              background: showArchived
                ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                : undefined,
              color: showArchived ? 'var(--primary)' : undefined,
              borderColor: showArchived ? 'var(--primary)' : undefined,
            }}
          >
            <Archive size={14} />
            {t('minhasfinancas.show_archived')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-new-card"
            onClick={() => setCreating(true)}
            style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.card_create')}
          </button>
        </div>
      </div>

      {/* Sem cartões */}
      {cards.length === 0 && (
        <div
          className="glass-card"
          data-testid="mf-cards-empty"
          style={{ padding: '3rem 2rem', textAlign: 'center' }}
        >
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
            {t('minhasfinancas.cards_empty')}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
            style={{ display: 'inline-flex' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.card_create')}
          </button>
        </div>
      )}

      {/* Drill-down: detalhe do cartão (lançamentos + faturas) */}
      {selectedRow ? (
        <MFAccountDetail
          account={selectedRow}
          user={user}
          monthKey={monthKey}
          onChangeMonth={setMonthKey}
          showValues={showValues}
          onClose={() => setSelectedId(null)}
          onEdit={(row) => setEditingId(row.id)}
        />
      ) : (
        <>
          {/* Grade de cards de cartão */}
          {cards.length > 0 && visibleCards.length === 0 && (
            <div
              className="glass-card"
              data-testid="mf-cards-filtered-empty"
              style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.no_results')}
            </div>
          )}
          <div
            data-testid="mf-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
              alignItems: 'start',
            }}
          >
            {visibleCards.map((item) => {
              // Limite comprometido: faturas futuras com despesa vinculada
              // contam no EM ABERTO/DISPONÍVEL mesmo com data futura
              // (ex.: fixas criadas 12 meses à frente) — sem a flag, só
              // entrava o que já tinha payment_date até o mês (Nubank com
              // despesas até 2027 mostrava R$ 0 em aberto).
              const built = buildCardInvoices({ card: item, transactions, refISO, monthKey, includeFutureBound: true });
              // EM ABERTO e DISPONÍVEL seguem a mesma régua das faturas
              // (fechadas + corrente, incluindo parcelas/estornos), em vez
              // de recalcular um saldo paralelo que divergia do detalhe.
              // EM ABERTO = TODAS as faturas não pagas (corrente + futuras
              // + vencidas): agendamento PENDENTE não abate — o dinheiro só
              // sai no vencimento, só PAGO zera. DISPONÍVEL/barra = limite
              // − em aberto (EM ABERTO + DISPONÍVEL = LIMITE, régua do
              // usuário; mesma régua do `payable` do modal de pagamento).
              const open = Math.max(0, Number(built.openTotal) || 0);
              const committed = Math.max(0, Number(built.pendingTotal) || 0);
              const currentOpen = Number(built.current.openAmount) || 0;
              const currentPending = Number(built.current.pendingBound) || 0;
              const used = open + committed;
              const limit = item.credit_limit != null ? Number(item.credit_limit) : null;
              const available = limit != null ? limit - used : null;
              const rawPct = limit && limit > 0 ? (used / limit) * 100 : 0;
              const pct = mfCardUsagePct(used, limit);
              const barColor = mfCardBarColor(item.color);
              const overLimit = limit != null && used > limit;
              const linked = accountById[item.linked_account_id];
              const inv = built.current;
              const total = Number(inv.total) || 0;
              const oldestOpen = built.oldestOpenInvoice;
              const cardMoney = (value) => money(value, item.currency);
              const fmtShort = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
              // Mês da fatura = mês do vencimento (vale para todos os cartões).
              const invMonth = (iso) =>
                iso ? formatMonthLabel(iso.slice(0, 7), i18n.language) : '';
              // Com ano: o botão pode mirar uma fatura antiga (a mais antiga
              // em aberto) — "20/03" sem ano parecia a fatura atual.
              const fmtDueY = (iso) =>
                iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—';

              return (
                <div
                  key={item.id}
                  className="glass-card-flat"
                  data-testid={`mf-card-widget-${item.id}`}
                  onClick={(event) => {
                    if (event.target.closest('button')) return;
                    setSelectedId(item.id);
                  }}
                  style={{
                    padding: '1.1rem 1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    cursor: 'pointer',
                    opacity: item.archived_at ? 0.6 : 1,
                  }}
                >
                  {/* Topo: ícone, nome, bandeira e ações */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <MFAccountIcon
                      account={item}
                      size={36}
                      data-testid={`mf-card-icon-${item.id}`}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button
                        type="button"
                        data-testid={`mf-open-card-${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(item.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          fontSize: '0.98rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'block',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.name}
                      </button>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.4rem',
                          alignItems: 'center',
                          marginTop: '0.25rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        {item.card_brand && (
                          <span
                            data-testid={`mf-card-brand-${item.id}`}
                            style={{
                              ...badgeChip,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <MFCardBrandIcon
                              brand={item.card_brand}
                              size={16}
                              title={t(`minhasfinancas.card_brand_${item.card_brand}`)}
                            />
                            {t(`minhasfinancas.card_brand_${item.card_brand}`)}
                          </span>
                        )}
                        {item.archived_at && (
                          <span
                            data-testid={`mf-card-archived-${item.id}`}
                            style={{ ...badgeChip, color: '#f59e0b' }}
                          >
                            {t('minhasfinancas.account_archived')}
                          </span>
                        )}
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {currencyFlag(item.currency)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        data-testid={`mf-edit-card-${item.id}`}
                        aria-label={t('minhasfinancas.edit')}
                        title={t('minhasfinancas.edit')}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCreating(false);
                          setEditingId(item.id);
                        }}
                        style={{ padding: '0.4rem' }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        data-testid={`mf-archive-card-${item.id}`}
                        aria-label={t(
                          item.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive'
                        )}
                        title={t(
                          item.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive'
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleArchiveCard(item);
                        }}
                        style={{
                          padding: '0.4rem',
                          color: item.archived_at ? 'var(--success, #10b981)' : undefined,
                        }}
                      >
                        {item.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Métricas: limite / em aberto / disponível */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <span style={metricLabel}>{t('minhasfinancas.card_limit')}</span>
                      <div data-testid={`mf-card-limit-${item.id}`} style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                        {limit != null ? cardMoney(limit) : '—'}
                      </div>
                    </div>
                    <div>
                      <span style={metricLabel}>{t('minhasfinancas.card_open')}</span>
                      <div
                        data-testid={`mf-card-open-${item.id}`}
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          color: used > 0 ? '#ef4444' : undefined,
                        }}
                      >
                        {cardMoney(used)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={metricLabel}>{t('minhasfinancas.card_available')}</span>
                      <div
                        data-testid={`mf-card-available-${item.id}`}
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          color:
                            available == null
                              ? undefined
                              : available >= 0
                                ? '#10b981'
                                : '#ef4444',
                        }}
                      >
                        {available != null ? cardMoney(available) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Barra de uso do limite */}
                  <div
                    aria-hidden
                    title={
                      limit && limit > 0
                        ? `${Math.round(rawPct * 10) / 10}%`
                        : t('minhasfinancas.card_no_limit_hint')
                    }
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: 'rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      data-testid={`mf-card-usage-${item.id}`}
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: overLimit ? '#ef4444' : barColor,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>

                  {/* Conta vinculada / fechamento / vencimento */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={metricLabel}>{t('minhasfinancas.card_account')}</span>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {linked?.name ?? '—'}
                      </div>
                    </div>
                    <div>
                      <span style={metricLabel}>{t('minhasfinancas.card_closing')}</span>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        {fmtShort(inv.closeISO)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={metricLabel}>{t('minhasfinancas.card_due_label')}</span>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        {fmtShort(inv.dueISO)}
                      </div>
                    </div>
                  </div>

                  {/* Fatura corrente + ação */}
                  <div
                    style={{
                      borderTop: '1px solid var(--glass-border)',
                      paddingTop: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: '1 1 auto', minWidth: 120 }}>
                      <span style={metricLabel}>
                        {t('minhasfinancas.card_current')}
                        {inv.dueISO ? ` · ${invMonth(inv.dueISO)}` : ''}
                      </span>
                      {/* Valor TOTAL da fatura: o em aberto zera ao pagar,
                          mas o valor pago continua visível aqui — o que está
                          em aberto já aparece na métrica EM ABERTO acima. */}
                      <div
                        data-testid={`mf-card-fatura-${item.id}`}
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          color: currentOpen > 0 ? undefined : 'var(--text-muted)',
                        }}
                      >
                        {cardMoney(total)}
                      </div>
                    </div>
                    {total > 0 && currentOpen <= 0 && currentPending <= 0.005 && (
                      <span
                        data-testid={`mf-card-fatura-paid-${item.id}`}
                        style={{
                          ...badgeChip,
                          color: '#10b981',
                          borderColor: 'rgba(16, 185, 129, 0.45)',
                          background: 'rgba(16, 185, 129, 0.12)',
                        }}
                      >
                        {t('minhasfinancas.card_status_paid')}
                      </span>
                    )}
                    {/* Fatura coberta só por pagamento PENDENTE (item 30):
                        chip Agendada + o Pagar continua à mão — confirmar
                        reajusta o MESMO agendado (ou paga antes). */}
                    {total > 0 && currentOpen <= 0 && currentPending > 0.005 && (
                      <span
                        data-testid={`mf-card-fatura-scheduled-${item.id}`}
                        style={{
                          ...badgeChip,
                          color: 'var(--primary)',
                          borderColor: 'color-mix(in srgb, var(--primary) 45%, transparent)',
                          background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                        }}
                      >
                        {t('minhasfinancas.card_status_scheduled')}
                      </span>
                    )}
                    {(currentOpen > 0 || currentPending > 0.005) && (
                      <>
                        {currentOpen > 0 && (
                          <span
                            style={{
                              ...badgeChip,
                              color: 'var(--primary)',
                              borderColor: 'color-mix(in srgb, var(--primary) 45%, transparent)',
                              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                            }}
                          >
                            {t('minhasfinancas.card_status_current')}
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn-primary"
                          data-testid={`mf-card-pay-${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePayCurrent(item, inv);
                          }}
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.5rem 0.85rem',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <Wallet size={14} />
                          {t('minhasfinancas.card_anticipate')}
                        </button>
                      </>
                    )}
                    {/* Corrente quitada/zerada, mas há uma fatura fechada em
                        aberto: oferece pagar a mais antiga (nomeando qual —
                        não é a corrente, que segue só com Reabrir). */}
                    {currentOpen <= 0 && oldestOpen && (
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid={`mf-card-pay-open-${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePayCurrent(item, oldestOpen);
                        }}
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.5rem 0.85rem',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <Wallet size={14} />
                        {t('minhasfinancas.card_pay')} · {fmtDueY(oldestOpen.dueISO)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Edição/cadastro de cartão (mesmo modal de contas: fechamento, vencimento, limite, conta) */}
      <MFAccountModal
        isOpen={!!editingCard || creating}
        account={editingCard}
        defaultType={creating ? 'CARTAO' : null}
        user={user}
        onClose={() => {
          setEditingId(null);
          setCreating(false);
        }}
      />

      {/* Pagamento da fatura corrente (valor total ou parcial) */}
      {paying && (
        <MFPaymentModal
          card={paying.card}
          invoice={paying.invoice}
          user={user}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
