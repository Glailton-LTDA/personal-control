import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Check, Clock, Lock, LockOpen, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFAllTransactions,
  useMFCategories,
  useUpdateMFTransaction,
  MF_INVOICE_PAYMENT_NOTE,
  buildCardInvoices,
  formatMoney,
  formatMonthLabel,
  monthRefISO,
  toISODate,
  currentMonthKey,
} from '../../hooks/useMinhasFinancas';
import MFPaymentModal from './MFPaymentModal';
import MFAdjustBalanceModal from './MFAdjustBalanceModal';
import MFCardBrandIcon from './MFCardBrandIcon';
import { readInvoiceSel, writeInvoiceSel } from './mfViewState';

const STATUS = {
  PAGA: { key: 'minhasfinancas.card_status_paid', color: '#10b981' },
  AGENDADA: { key: 'minhasfinancas.card_status_scheduled', color: 'var(--primary)' },
  EM_ABERTO: { key: 'minhasfinancas.card_status_open', color: '#f59e0b' },
  VENCIDA: { key: 'minhasfinancas.card_status_overdue', color: '#ef4444' },
  CORRENTE: { key: 'minhasfinancas.card_status_current', color: 'var(--primary)' },
};

const chipStyle = (active, color) => ({
  fontSize: '0.78rem',
  fontWeight: 700,
  padding: '0.45rem 0.8rem',
  borderRadius: 999,
  border: active
    ? `1px solid color-mix(in srgb, ${color} 65%, transparent)`
    : '1px solid var(--glass-border)',
  background: active
    ? `color-mix(in srgb, ${color} 12%, transparent)`
    : 'transparent',
  color: active ? color : 'var(--text-muted)',
  cursor: 'pointer',
});

/**
 * Faturas de um cartão: chips (corrente + fechadas) + detalhe com período,
 * totais, lançamentos e ações de pagar/antecipar. Usado no drill-down do
 * cartão (detalhe da conta com account_type = CARTAO). Com `onEditTx`, o
 * clique numa linha da tabela abre a edição do lançamento.
 */
export default function MFCardInvoices({ card, user, showValues = true, monthKey = currentMonthKey(), onEditTx = null, onManualTx = null, onOpenTransfer = null }) {
  const { t, i18n } = useTranslation();
  const { data: transactions = [] } = useMFAllTransactions(user);
  const { data: categories = [] } = useMFCategories(user);
  // Fatura selecionada sobrevive ao F5 (por cartão, em qualquer
  // superfície); inválida ou sumida → corrente.
  const [selectedInvoice, setSelectedInvoice] = useState(
    () => readInvoiceSel(card.id) ?? 'current'
  );
  const [paying, setPaying] = useState(null); // invoice escolhida no modal
  const [adjustOpen, setAdjustOpen] = useState(false);

  const categoryById = useMemo(
    () => Object.fromEntries((categories || []).map((row) => [row.id, row])),
    [categories]
  );

  const refISO = monthRefISO(monthKey);
  const { current, invoices, upcomingInvoices = [] } = useMemo(
    () => buildCardInvoices({ card, transactions, refISO, monthKey }),
    [card, transactions, refISO, monthKey]
  );
  /** Faturas com movimento (igual à tela original de cartões). */
  const shownInvoices = useMemo(
    () => invoices.filter((inv) => inv.total > 0 || inv.openAmount > 0),
    [invoices]
  );
  /** Futuras com despesa vinculada (picker do app original). */
  const shownUpcoming = useMemo(
    () => upcomingInvoices.filter((inv) => inv.total > 0 || inv.openAmount > 0),
    [upcomingInvoices]
  );

  useEffect(() => {
    setSelectedInvoice(readInvoiceSel(card.id) ?? 'current');
  }, [card.id]);

  useEffect(() => {
    writeInvoiceSel(card.id, selectedInvoice);
  }, [card.id, selectedInvoice]);

  const activeInvoice =
    selectedInvoice === 'current'
      ? current
      : [...shownUpcoming, ...shownInvoices].find((inv) => inv.closeISO === selectedInvoice) ??
        current;
  // Seleção salva que sumiu (fatura sem movimento) → volta à corrente.
  const selectedKnown =
    selectedInvoice === 'current' ||
    [...shownUpcoming, ...shownInvoices].some((inv) => inv.closeISO === selectedInvoice);
  useEffect(() => {
    if (!selectedKnown) setSelectedInvoice('current');
  }, [selectedKnown]);
  const cardStatus = STATUS[activeInvoice.status] ?? STATUS.CORRENTE;
  const linkedOk = !!card.linked_account_id;

  const money = (value) => (showValues ? formatMoney(value, card.currency || 'BRL') : '•••');
  // Mês da fatura = mês do VENCIMENTO (vale para todos os cartões).
  const invMonth = (iso) => (iso ? formatMonthLabel(iso.slice(0, 7), i18n.language) : '');
  const formatDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  /** Abre o modal de pagamento (total ou parcial) da fatura escolhida. */
  const handlePay = (invoice) => {
    if (!linkedOk) {
      toast.error(t('minhasfinancas.card_link_required'));
      return;
    }
    setPaying(invoice);
  };

  // Métricas do bloco "Fatura/Estornos/Pagamentos" (padrão do app original):
  // total líquido, estornos (negativos), já pago (alocado) e em aberto.
  // "Despesas no mês" = bruto (sem abater estornos); "Fatura" = líquido.
  const invTotal = Number(activeInvoice?.total) || 0;
  const invRefunds = Number(activeInvoice?.refunds) || 0;
  const invPaid = Number(activeInvoice?.paid) || 0;
  const invOpen = Number(activeInvoice?.openAmount) || 0;
  const invGross = invTotal + invRefunds;
  const invPending = Number(activeInvoice?.pendingBound) || 0;
  // Coberta = em aberto zerado. Paga de verdade = coberta SEM pendente
  // aguardando (item 30): com pagamento vinculado PENDENTE, a fatura está
  // AGENDADA — vence e o agendador promove a PAGA; Reabrir devolve a PENDENTE.
  const invCovered = invOpen < 0.005;
  const invIsScheduled = invCovered && invPending > 0.005;
  const invIsPaid = invCovered && !invIsScheduled;
  const invIsPartial = !invCovered && invPaid > 0.005;
  const invIsClosed = selectedInvoice !== 'current';
  const invIsFuture = !!activeInvoice?.future;
  const invBadge = invIsPaid
    ? { key: 'minhasfinancas.inv_status_paid', color: '#10b981', Icon: Check }
    : invIsScheduled
      ? { key: 'minhasfinancas.inv_status_scheduled', color: 'var(--primary)', Icon: Clock }
      : invIsClosed && !invIsFuture && !invIsPartial
        ? { key: 'minhasfinancas.inv_status_closed', color: '#ef4444', Icon: Lock }
        : { key: 'minhasfinancas.inv_status_open', color: 'var(--primary)', Icon: LockOpen };
  const invTitle = invIsPaid
    ? t('minhasfinancas.inv_title_paid')
    : invIsScheduled
      ? t('minhasfinancas.inv_title_scheduled')
      : invIsPartial
      ? t('minhasfinancas.inv_title_partial')
      : selectedInvoice === 'current'
        ? t('minhasfinancas.card_current')
        : t('minhasfinancas.inv_title_open');

  const updateTx = useUpdateMFTransaction();
  // Pagamentos atribuíveis à fatura (vínculo invoice_close) — só eles podem
  // ser removidos pelo "Reabrir". Modelo novo: DESPESA na conta vinculada;
  // modelo antigo (TRANSFERENCIA → cartão) segue contado. O que veio por
  // FIFO antigo não tem dono.
  const linkedPayments = useMemo(
    () =>
      (transactions ?? []).filter(
        (tx) =>
          tx.invoice_close === activeInvoice?.closeISO &&
          tx.status !== 'CANCELADO' &&
          ((tx.type === 'TRANSFERENCIA' && tx.transfer_account_id === card.id) ||
            (tx.type === 'DESPESA' &&
              tx.account_id === card.linked_account_id &&
              tx.invoice_close))
      ),
    [transactions, card.id, card.linked_account_id, activeInvoice?.closeISO]
  );

  /**
   * Reabrir (item 30): NÃO exclui nada — o pagamento vinculado PAGO volta
   * para PENDENTE e o espelho perde o marcador automático (o agendador não
   * re-promove nem re-sincroniza depois: a linha fica sua). O valor já é o
   * atual da fatura: o espelho é sincronizado continuamente e este botão só
   * aparece com a fatura coberta (em aberto = 0), ou seja, com pagamento
   * igual ao valor da fatura na hora.
   */
  const handleReopen = () => {
    const flipable = linkedPayments.filter((row) => row.status === 'PAGO');
    if (flipable.length === 0) return;
    confirmToast(
      t('minhasfinancas.card_reopen_confirm', { count: flipable.length }),
      async () => {
        try {
          await Promise.all(
            flipable.map((row) =>
              updateTx.mutateAsync({
                id: row.id,
                status: 'PENDENTE',
                effective_date: null,
                notes: row.notes === MF_INVOICE_PAYMENT_NOTE ? null : row.notes,
              })
            )
          );
          toast.success(t('minhasfinancas.card_reopened'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.card_reopen') }
    );
  };

  return (
    <div
      data-testid="mf-card-invoices"
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}
    >
      {/* Chips de fatura */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="mf-invoice-chip-current"
          onClick={() => setSelectedInvoice('current')}
          style={chipStyle(selectedInvoice === 'current', STATUS.CORRENTE.color)}
        >
          {t('minhasfinancas.card_current')}
          {current.dueISO ? ` · ${invMonth(current.dueISO)}` : ''}
          {' · '}
          {money(current.total)}
        </button>
        {shownUpcoming.map((inv) => (
          <button
            key={inv.closeISO}
            type="button"
            data-testid={`mf-invoice-chip-${inv.closeISO}`}
            onClick={() => setSelectedInvoice(inv.closeISO)}
            style={chipStyle(selectedInvoice === inv.closeISO, STATUS[inv.status].color)}
          >
            {invMonth(inv.dueISO)} · {t('minhasfinancas.card_due')} {formatDate(inv.dueISO)} · {money(inv.total)}
            {' · '}
            <strong style={{ color: STATUS[inv.status].color }}>
              {t(STATUS[inv.status].key)}
            </strong>
          </button>
        ))}
        {shownInvoices.map((inv) => (
          <button
            key={inv.closeISO}
            type="button"
            data-testid={`mf-invoice-chip-${inv.closeISO}`}
            onClick={() => setSelectedInvoice(inv.closeISO)}
            style={chipStyle(selectedInvoice === inv.closeISO, STATUS[inv.status].color)}
          >
            {invMonth(inv.dueISO)} · {t('minhasfinancas.card_due')} {formatDate(inv.dueISO)} · {money(inv.total)}
            {' · '}
            <strong style={{ color: STATUS[inv.status].color }}>
              {t(STATUS[inv.status].key)}
            </strong>
          </button>
        ))}
      </div>

      {/* Detalhe */}
      <div
        className="glass-card"
        data-testid="mf-invoice-detail"
        style={{ padding: '1.25rem 1.5rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: '0.75rem',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              minWidth: 0,
            }}
          >
            <MFCardBrandIcon brand={card.card_brand} size={22} title={card.name} />
            <strong style={{ fontSize: '1.05rem' }}>
              {selectedInvoice === 'current'
                ? `${t('minhasfinancas.card_current')}${activeInvoice?.dueISO ? ` · ${invMonth(activeInvoice.dueISO)}` : ''}`
                : `${invMonth(activeInvoice?.dueISO)} · ${t('minhasfinancas.card_due')} ${formatDate(activeInvoice?.dueISO)}`}
            </strong>
          </span>
          <span
            data-testid="mf-invoice-status"
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: cardStatus.color,
              background: `color-mix(in srgb, ${cardStatus.color} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${cardStatus.color} 35%, transparent)`,
              borderRadius: 999,
              padding: '0.15rem 0.65rem',
            }}
          >
            {t(cardStatus.key)}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            flexWrap: 'wrap',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            marginBottom: '1rem',
          }}
        >
          <span>
            {t('minhasfinancas.card_closing')}:{' '}
            <strong style={{ color: 'var(--text-main)' }}>
              {formatDate(activeInvoice?.closeISO)}
            </strong>
          </span>
          <span>
            {t('minhasfinancas.card_due_label')}:{' '}
            <strong style={{ color: 'var(--text-main)' }}>
              {formatDate(activeInvoice?.dueISO)}
            </strong>
          </span>
        </div>

        {activeInvoice && (
          <>
            {/* Resumo Fatura/Estornos/Pagamentos — padrão do app original */}
            <div
              data-testid="mf-invoice-summary"
              style={{
                borderTop: '1px dashed var(--glass-border)',
                paddingTop: '0.9rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    fontSize: '0.9rem',
                  }}
                >
                  <span style={{ fontSize: '1rem', fontWeight: 800 }}>{invTitle}</span>
                  {invIsPaid || invIsPartial ? (
                    <>
                      <span>
                        {t('minhasfinancas.inv_paid_amount')}:{' '}
                        <strong style={{ color: '#10b981' }}>{money(invPaid)}</strong>
                      </span>
                      <span>
                        {t('minhasfinancas.inv_month_expenses')}:{' '}
                        <strong style={{ color: '#ef4444' }}>{money(invGross)}</strong>
                      </span>
                    </>
                  ) : invIsScheduled ? (
                    <>
                      <span>
                        {t('minhasfinancas.inv_scheduled_amount')}:{' '}
                        <strong style={{ color: 'var(--primary)' }}>{money(invPending)}</strong>
                      </span>
                      <span>
                        {t('minhasfinancas.inv_month_expenses')}:{' '}
                        <strong style={{ color: '#ef4444' }}>{money(invGross)}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        {t('minhasfinancas.inv_title_open')}:{' '}
                        <strong data-testid="mf-invoice-total" style={{ color: '#ef4444' }}>
                          {money(invTotal)}
                        </strong>
                      </span>
                      {invRefunds > 0 && (
                        <span>
                          {t('minhasfinancas.inv_refunds')}:{' '}
                          <strong style={{ color: '#10b981' }}>{money(invRefunds)}</strong>
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: invIsPaid || invIsScheduled ? '#10b981' : '#ef4444',
                    }}
                  >
                    {(invIsPaid || invIsScheduled) && <Check size={20} />}
                    <span data-testid="mf-invoice-open">{money(invOpen)}</span>
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                  marginTop: '0.65rem',
                }}
              >
                <span
                  data-testid="mf-invoice-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: invBadge.color,
                    background: `color-mix(in srgb, ${invBadge.color} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${invBadge.color} 40%, transparent)`,
                    borderRadius: 999,
                    padding: '0.2rem 0.7rem',
                  }}
                >
                  <invBadge.Icon size={13} />
                  {t(invBadge.key)}
                </span>
                <span
                  style={{ display: 'inline-flex', gap: '0.9rem', alignItems: 'center' }}
                >
                {invIsPaid ? (
                  linkedPayments.length > 0 && (
                    <button
                      type="button"
                      data-testid="mf-invoice-reopen"
                      onClick={handleReopen}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--primary)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={15} />
                      {t('minhasfinancas.card_reopen')}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    data-testid={
                      selectedInvoice === 'current' ? 'mf-invoice-anticipate' : 'mf-invoice-pay'
                    }
                    onClick={() => handlePay(activeInvoice)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--primary)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <Wallet size={15} />
                    {t('minhasfinancas.card_register_payment')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="mf-invoice-adjust"
                  onClick={() => setAdjustOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--primary)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {t('minhasfinancas.inv_adjust_title')}
                </button>
                </span>
              </div>
            </div>

            {/* Lançamentos da fatura */}
            {activeInvoice.transactions.length === 0 ? (
              <p
                data-testid="mf-invoice-empty"
                style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}
              >
                {t('minhasfinancas.card_no_purchases')}
              </p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                  <tbody>
                    {activeInvoice.transactions.map((tx) => {
                      const value = Number(tx.amount) || 0;
                      // Pintura da lista da fatura (app original):
                      // despesa − vermelha, estorno (devolução) + verde.
                      const refund = value < 0;
                      const shown = refund ? Math.abs(value) : -Math.abs(value);
                      const category = tx.category_id
                        ? categoryById[tx.category_id]
                        : null;
                      return (
                        <tr
                          key={tx.id}
                          data-testid="mf-card-tx-row"
                          className={onEditTx ? 'table-row-hover' : undefined}
                          style={{
                            borderTop: '1px solid var(--glass-border)',
                            cursor: onEditTx ? 'pointer' : undefined,
                          }}
                          onClick={onEditTx ? () => onEditTx(tx) : undefined}
                        >
                          <td
                            style={{
                              padding: '0.55rem 0.4rem',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatDate(tx.payment_date)}
                          </td>
                          <td style={{ padding: '0.55rem 0.4rem', fontSize: '0.86rem' }}>
                            {tx.description}
                            {category && (
                              <span
                                data-testid="mf-card-tx-category"
                                style={{
                                  marginLeft: '0.45rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--glass-border)',
                                  borderRadius: 6,
                                  padding: '0.05rem 0.35rem',
                                }}
                              >
                                {category.name}
                              </span>
                            )}
                            {tx.installments_total > 1 && (
                              <span
                                style={{
                                  marginLeft: '0.45rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--glass-border)',
                                  borderRadius: 6,
                                  padding: '0.05rem 0.35rem',
                                }}
                              >
                                {tx.installments_current}/{tx.installments_total}
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '0.55rem 0.4rem',
                              textAlign: 'right',
                              fontSize: '0.88rem',
                              fontWeight: 700,
                              color: refund ? '#10b981' : '#ef4444',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {showValues ? formatMoney(shown, card.currency || 'BRL') : '•••'}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Linha de total da fatura (líquido, já com estornos) */}
                    <tr
                      data-testid="mf-invoice-total-row"
                      style={{ borderTop: '1px solid var(--glass-border)' }}
                    >
                      <td
                        colSpan={2}
                        style={{
                          padding: '0.6rem 0.4rem',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t('minhasfinancas.inv_total')}
                      </td>
                      <td
                        style={{
                          padding: '0.6rem 0.4rem',
                          textAlign: 'right',
                          fontSize: '0.95rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {showValues
                          ? formatMoney(Number(activeInvoice.total) || 0, card.currency || 'BRL')
                          : '•••'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Aviso de conta não vinculada (a ação mora no resumo acima) */}
            {!linkedOk && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span
                  data-testid="mf-invoice-link-hint"
                  style={{ fontSize: '0.78rem', color: '#f59e0b', alignSelf: 'center' }}
                >
                  {t('minhasfinancas.card_link_required')}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagamento da fatura escolhida (valor total ou parcial) */}
      {paying && (
        <MFPaymentModal
          card={card}
          invoice={paying}
          user={user}
          onClose={() => setPaying(null)}
        />
      )}

      {/* Reajustar saldo da fatura ativa */}
      {adjustOpen && activeInvoice && (() => {
        const today = toISODate(new Date());
        return (
          <MFAdjustBalanceModal
            account={card}
            user={user}
            current={invTotal}
            payDate={
              invIsClosed && !invIsFuture
                ? activeInvoice.closeISO
                : today <= refISO
                  ? today
                  : refISO
            }
            invoiceLabel={
              selectedInvoice === 'current'
                ? `${t('minhasfinancas.card_current')}${activeInvoice?.dueISO ? ` · ${invMonth(activeInvoice.dueISO)}` : ''}`
                : `${invMonth(activeInvoice?.dueISO)} · ${t('minhasfinancas.card_due')} ${formatDate(activeInvoice?.dueISO)}`
            }
            allowInitial={false}
            onClose={() => setAdjustOpen(false)}
            onManual={() => onManualTx?.()}
            onTransfer={() => onOpenTransfer?.()}
          />
        );
      })()}
    </div>
  );
}
