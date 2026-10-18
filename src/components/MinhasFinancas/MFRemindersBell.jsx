import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import {
  useMFAccounts,
  useMFAllTransactions,
  useMFNarrowScreen,
  formatMoney,
  mfInstallmentSuffix,
  toISODate,
} from '../../hooks/useMinhasFinancas';
import { planMFReminders } from './mfReminders';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_MF_VAPID_PUBLIC_KEY ?? '';

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = window.atob(raw);
  return Uint8Array.from([...bytes].map((char) => char.charCodeAt(0)));
};

const toBase64Url = (buffer) =>
  window
    .btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * Sino de lembretes do Minhas Finanças (Fase 1 in-app + opt-in do push).
 * Conta os lembretes do dia (`planMFReminders`); o clique num lembrete
 * leva aos Lançamentos no mês do vencimento. O rodapé do painel ativa
 * o push neste aparelho (Web Push/VAPID, mesma base do Babylog).
 */
export default function MFRemindersBell({ user, onChangeMonth, testId = 'mf-reminders' }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // No estreito o sino encosta na borda esquerda e o dropdown sairia da
  // tela — o painel vira bottom-sheet ancorado embaixo (mesma lógica de
  // breakpoint do Resumo, ≤768px).
  const isNarrow = useMFNarrowScreen();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: allTx = [], isLoading } = useMFAllTransactions(user);
  const [pushState, setPushState] = useState('unknown'); // on | off | unsupported | unknown
  const [pushBusy, setPushBusy] = useState(false);

  const reminders = useMemo(() => {
    const accountsById = Object.fromEntries((accounts ?? []).map((acc) => [acc.id, acc]));
    return planMFReminders(allTx ?? [], {
      accountsById,
      todayISO: toISODate(new Date()),
    });
  }, [accounts, allTx]);

  // Estado do push neste aparelho (inscrição existente?).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
        if (!cancelled) setPushState('unsupported');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setPushState(existing ? 'on' : 'off');
      } catch {
        if (!cancelled) setPushState('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSubscriptionRow = async ({ endpoint, p256dh, auth, remove }) => {
    if (remove) {
      await supabase.from('mf_push_subscriptions').delete().eq('endpoint', endpoint);
      return;
    }
    await supabase.from('mf_push_subscriptions').upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: 'endpoint' }
    );
  };

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const manager = registration.pushManager;
      const existing = await manager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await setSubscriptionRow({ endpoint, remove: true });
        setPushState('off');
        toast.success(t('minhasfinancas.rem_push_off'));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error(t('minhasfinancas.rem_push_blocked'));
        return;
      }
      const subscription = await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const rawP256dh = subscription.getKey('p256dh');
      const rawAuth = subscription.getKey('auth');
      if (!rawP256dh || !rawAuth) throw new Error('keys');
      await setSubscriptionRow({
        endpoint: subscription.endpoint,
        p256dh: toBase64Url(rawP256dh),
        auth: toBase64Url(rawAuth),
      });
      setPushState('on');
      toast.success(t('minhasfinancas.rem_push_on'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setPushBusy(false);
    }
  };

  const pick = (reminder) => {
    setOpen(false);
    onChangeMonth?.(reminder.dueISO.slice(0, 7));
    window.dispatchEvent(
      new CustomEvent('set-active-tab', { detail: { tab: 'minhasfinancas-transactions' } })
    );
  };

  const kindStyle = (kind) =>
    kind === 'overdue'
      ? { color: '#ef4444', label: t('minhasfinancas.rem_overdue') }
      : kind === 'today'
        ? { color: '#f59e0b', label: t('minhasfinancas.rem_today') }
        : { color: 'var(--primary)', label: t('minhasfinancas.rem_upcoming') };

  const dueLabel = (reminder) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit' }).format(
        new Date(`${reminder.dueISO}T12:00:00`)
      );
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
        zIndex: 90,
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

  return (
    <span style={{ position: 'relative' }}>
      {open && isNarrow && (
        <span
          data-testid={`${testId}-overlay`}
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0, 0, 0, 0.55)' }}
        />
      )}
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
        {!isLoading && reminders.length > 0 && (
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
      {open && (
        <span
          data-testid={`${testId}-panel`}
          style={panelStyle}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.1rem 0.3rem' }}>
            {t('minhasfinancas.rem_title')}
          </span>
          {reminders.length === 0 && (
            <span
              data-testid={`${testId}-empty`}
              style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.4rem 0.3rem' }}
            >
              {t('minhasfinancas.rem_empty')}
            </span>
          )}
          {reminders.map((reminder) => {
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
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {reminder.description}
                    {mfInstallmentSuffix({
                      installments_current: reminder.installmentsCurrent,
                      installments_total: reminder.installmentsTotal,
                    })}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(reminder.amount, reminder.currency)}
                  </span>
                </span>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {reminder.accountName ?? ''}
                  </span>
                  <span style={{ color: kind.color, fontWeight: 700, flexShrink: 0 }}>
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
              {t('minhasfinancas.rem_push_hint')}
            </span>
            <button
              type="button"
              className="btn-cancel"
              data-testid={`${testId}-push-toggle`}
              disabled={pushBusy || pushState === 'unsupported' || pushState === 'unknown'}
              aria-pressed={pushState === 'on'}
              onClick={togglePush}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', flexShrink: 0 }}
            >
              {t(
                pushState === 'on'
                  ? 'minhasfinancas.rem_push_on_btn'
                  : 'minhasfinancas.rem_push_off_btn'
              )}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
