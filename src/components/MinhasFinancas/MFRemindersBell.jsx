import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import {
  useMFAccounts,
  useMFReminderRows,
  useMFCardTransactions,
  useMFInvoices,
  applyCardInvoiceRecords,
  buildInvoiceRecordMap,
  buildCardInvoices,
  currentMonthKey,
  cardCloseForMonth,
  shiftMonth,
  useMFNarrowScreen,
  formatMoney,
  mfInstallmentSuffix,
  toISODate,
} from '../../hooks/useMinhasFinancas';
import { planMFReminders, planMFInvoiceReminders } from './mfReminders';

/** In-app finance reminders; global push preferences live in app settings. */
export default function MFRemindersBell({
  user,
  onChangeMonth,
  testId = 'mf-reminders',
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // No estreito o sino encosta na borda esquerda e o dropdown sairia da
  // tela — o painel vira bottom-sheet ancorado embaixo (mesma lógica de
  // breakpoint do Resumo, ≤768px).
  const isNarrow = useMFNarrowScreen();
  const { data: accounts = [] } = useMFAccounts(user);
  // Só os pendentes (e as colunas do planeador) — antes o sino baixava a
  // tabela inteira de lançamentos a cada montagem do módulo.
  const { data: allTx = [], isLoading } = useMFReminderRows(user);
  // Cartões: o aviso de fatura fechada precisa do total do ciclo que fecha
  // hoje. O hook já é usado em Cartões/Resumo e fica em cache por 10 min.
  const cardAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (acc) => acc.account_type === 'CARTAO' && !acc.archived_at,
      ),
    [accounts],
  );
  const closingCards = useMemo(() => {
    const today = toISODate(new Date());
    const monthKey = today.slice(0, 7);
    return cardAccounts.filter(
      (card) =>
        cardCloseForMonth(card, monthKey) === today ||
        cardCloseForMonth(card, shiftMonth(monthKey, -1)) === today,
    );
  }, [cardAccounts]);
  const { data: cardData, isLoading: cardLoading } = useMFCardTransactions(
    user,
    closingCards,
    currentMonthKey(),
  );
  // Baixa manual/importada zera o lembrete de fechamento: a fatura oficial
  // já está resolvida, mesmo que o cálculo derivado ainda mostre saldo.
  const { data: invoiceRecords = [] } = useMFInvoices(
    user,
    closingCards.map((card) => card.id),
  );
  const invoiceRecordMap = useMemo(
    () => buildInvoiceRecordMap(invoiceRecords),
    [invoiceRecords],
  );

  const txReminders = useMemo(() => {
    const accountsById = Object.fromEntries(
      (accounts ?? []).map((acc) => [acc.id, acc]),
    );
    return planMFReminders(allTx ?? [], {
      accountsById,
      todayISO: toISODate(new Date()),
    });
  }, [accounts, allTx]);

  const invoiceReminders = useMemo(() => {
    const today = toISODate(new Date());
    const transactions = cardData?.transactions ?? [];
    const settings = cardData?.settings ?? [];
    const built = [];
    for (const card of closingCards) {
      const { current, invoices = [] } = applyCardInvoiceRecords(
        buildCardInvoices({
          card,
          transactions,
          refISO: today,
          monthKey: currentMonthKey(),
          count: 2,
          includeFutureBound: true,
          aggregates: cardData?.aggregates ?? null,
          settings,
        }),
        invoiceRecordMap,
        card.id,
        today,
      );
      const seen = new Set();
      for (const invoice of [current, ...invoices]) {
        if (
          !invoice ||
          invoice.closeISO !== today ||
          seen.has(invoice.closeISO)
        )
          continue;
        seen.add(invoice.closeISO);
        built.push({
          ...invoice,
          cardId: card.id,
          cardName: card.name,
          currency: card.currency,
        });
      }
    }
    return planMFInvoiceReminders(built, today);
  }, [closingCards, cardData, invoiceRecordMap]);

  const reminders = useMemo(
    () => [...invoiceReminders, ...txReminders],
    [invoiceReminders, txReminders],
  );

  const pick = (reminder) => {
    setOpen(false);
    if (reminder.kind === 'invoice_closed') {
      if (reminder.dueISO) onChangeMonth?.(reminder.dueISO.slice(0, 7));
      window.dispatchEvent(
        new CustomEvent('set-active-tab', {
          detail: { tab: 'minhasfinancas/cards' },
        }),
      );
      return;
    }
    onChangeMonth?.(reminder.dueISO.slice(0, 7));
    window.dispatchEvent(
      new CustomEvent('set-active-tab', {
        detail: { tab: 'minhasfinancas/transactions' },
      }),
    );
  };

  const kindStyle = (kind) =>
    kind === 'overdue'
      ? { color: '#ef4444', label: t('minhasfinancas.rem_overdue') }
      : kind === 'today'
        ? { color: '#f59e0b', label: t('minhasfinancas.rem_today') }
        : kind === 'invoice_closed'
          ? { color: '#8b5cf6', label: t('minhasfinancas.rem_invoice_closed') }
          : {
              color: 'var(--primary)',
              label: t('minhasfinancas.rem_upcoming'),
            };

  const dueLabel = (reminder) => {
    if (!reminder.dueISO) return '—';
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        day: '2-digit',
        month: '2-digit',
      }).format(new Date(`${reminder.dueISO}T12:00:00`));
    } catch {
      return reminder.dueISO;
    }
  };

  // No estreito vira bottom-sheet de baixo (fixed); no largo, o dropdown
  // ancorado no sino como antes.
  const panelStyle = isNarrow
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        // Acima do .main-header (z-index 100) — o painel é portalizado no body.
        zIndex: 1100,
        width: 'auto',
        maxWidth: 'none',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: 'var(--glass-bg, #1e293b)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px 16px 0 0',
        padding: '0.9rem 1rem calc(1rem + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
      }
    : {
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 0.4rem)',
        zIndex: 60,
        width: 330,
        maxWidth: '86vw',
        maxHeight: 420,
        overflowY: 'auto',
        background: 'var(--glass-bg, #1e293b)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: '0.7rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      };

  // Camada do sino (overlay + painel). No estreito ela vai via portal no
  // <body>: o glass-card do cabeçalho tem backdrop-filter, que cria um
  // containing block para position:fixed — sem o portal o bottom-sheet
  // ficava ancorado no card em vez do pé da tela. zIndex acima do header.
  const bellLayer = open ? (
    <>
      {isNarrow && (
        <span
          data-testid={`${testId}-overlay`}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1099,
            background: 'rgba(0, 0, 0, 0.55)',
          }}
        />
      )}
      <span data-testid={`${testId}-panel`} style={panelStyle}>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            padding: '0.1rem 0.3rem',
          }}
        >
          {t('minhasfinancas.rem_title')}
        </span>
        {reminders.length === 0 && (
          <span
            data-testid={`${testId}-empty`}
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              padding: '0.4rem 0.3rem',
            }}
          >
            {t('minhasfinancas.rem_empty')}
          </span>
        )}
        {invoiceReminders.map((reminder) => {
          const kind = kindStyle(reminder.kind);
          const openLabel =
            reminder.openAmount > 0.005
              ? t('minhasfinancas.rem_invoice_open', {
                  amount: formatMoney(reminder.openAmount, reminder.currency),
                })
              : reminder.pendingBound > 0.005
                ? t('minhasfinancas.rem_invoice_scheduled')
                : t('minhasfinancas.rem_invoice_paid');
          return (
            <button
              key={reminder.key}
              type="button"
              data-testid={`${testId}-invoice-${reminder.cardId}`}
              onClick={() => pick(reminder)}
              style={{
                background: 'none',
                border: 'none',
                textAlign: 'left',
                padding: '0.55rem 0.6rem',
                borderRadius: 10,
                cursor: 'pointer',
                font: 'inherit',
                color: 'var(--text-main)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.15rem',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('minhasfinancas.rem_invoice_title', {
                    card: reminder.cardName,
                  })}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatMoney(reminder.total, reminder.currency)}
                </span>
              </span>
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {openLabel}
                </span>
                <span
                  style={{ color: kind.color, fontWeight: 700, flexShrink: 0 }}
                >
                  {kind.label}
                  {reminder.dueISO ? ` · ${dueLabel(reminder)}` : ''}
                </span>
              </span>
            </button>
          );
        })}
        {txReminders.map((reminder) => {
          const kind = kindStyle(reminder.kind);
          return (
            <button
              key={reminder.key}
              type="button"
              data-testid={`${testId}-item-${reminder.txId}`}
              onClick={() => pick(reminder)}
              style={{
                background: 'none',
                border: 'none',
                textAlign: 'left',
                padding: '0.55rem 0.6rem',
                borderRadius: 10,
                cursor: 'pointer',
                font: 'inherit',
                color: 'var(--text-main)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.15rem',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reminder.description}
                  {mfInstallmentSuffix({
                    installments_current: reminder.installmentsCurrent,
                    installments_total: reminder.installmentsTotal,
                  })}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatMoney(reminder.amount, reminder.currency)}
                </span>
              </span>
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reminder.accountName ?? ''}
                </span>
                <span
                  style={{ color: kind.color, fontWeight: 700, flexShrink: 0 }}
                >
                  {kind.label} · {dueLabel(reminder)}
                </span>
              </span>
            </button>
          );
        })}
        <span
          style={{
            borderTop: '1px solid var(--glass-border)',
            marginTop: '0.3rem',
            paddingTop: '0.55rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {t('push.manage_hint')}
          </span>
          <a
            href="/settings/general"
            data-testid={`${testId}-push-settings`}
            className="btn-cancel"
            onClick={(event) => {
              if (
                event.button === 0 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                setOpen(false);
                window.dispatchEvent(
                  new CustomEvent('set-active-tab', {
                    detail: { tab: 'settings/general' },
                  }),
                );
              }
            }}
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '0.75rem',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            {t('push.open_settings')}
          </a>
        </span>
      </span>
    </>
  ) : null;

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        data-testid={`${testId}-bell`}
        aria-label={t('minhasfinancas.rem_title')}
        title={t('minhasfinancas.rem_title')}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{ position: 'relative', padding: '0.55rem' }}
      >
        <Bell size={17} />
        {!isLoading && !cardLoading && reminders.length > 0 && (
          <span
            data-testid={`${testId}-count`}
            aria-hidden
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 17,
              height: 17,
              borderRadius: 999,
              background: '#ef4444',
              color: '#fff',
              fontSize: '0.62rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 0.2rem',
            }}
          >
            {reminders.length > 99 ? '99+' : reminders.length}
          </span>
        )}
      </button>
      {bellLayer &&
        (isNarrow ? createPortal(bellLayer, document.body) : bellLayer)}
    </span>
  );
}
