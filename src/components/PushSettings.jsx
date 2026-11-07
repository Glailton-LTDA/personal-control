import React, { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  disableGlobalPush,
  enableGlobalPush,
  pushConfigured,
  pushSupported,
  readGlobalPush,
} from '../lib/push';
import './PushSettings.css';

export default function PushSettings({ userId }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState({ state: 'loading', enabled: false });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    let alive = true;
    readGlobalPush(userId)
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => {
        if (alive) setStatus({ state: 'error', enabled: false });
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(load, [load]);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const value = status.enabled
        ? await disableGlobalPush(userId)
        : await enableGlobalPush(
            userId,
            i18n.resolvedLanguage || i18n.language,
          );
      setStatus(value);
      toast.success(
        t(value.enabled ? 'push.enabled_feedback' : 'push.disabled_feedback'),
      );
    } catch (error) {
      toast.error(
        t(error?.message === 'blocked' ? 'push.blocked' : 'push.error'),
      );
      load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="glass-card app-push-settings"
      data-testid="global-push-settings"
    >
      <header>
        <div className="app-push-heading">
          <span className="app-push-icon">
            <Bell size={24} />
          </span>
          <div>
            <h3>{t('push.title')}</h3>
            <p>{t('push.description')}</p>
          </div>
        </div>
      </header>
      <div className="app-push-row">
        <span role="status">{t(`push.state_${status.state}`)}</span>
        <button
          type="button"
          className="btn-primary"
          data-testid="global-push-toggle"
          aria-pressed={status.enabled}
          disabled={
            busy ||
            ['loading', 'error'].includes(status.state) ||
            (!status.enabled &&
              (!pushSupported() ||
                !pushConfigured() ||
                status.state === 'blocked'))
          }
          onClick={toggle}
        >
          {t(
            busy
              ? 'push.saving'
              : status.enabled
                ? 'push.disable'
                : 'push.enable',
          )}
        </button>
      </div>
      <p>{t('push.device_hint')}</p>
      <p>{t('push.privacy_hint')}</p>
      {status.state === 'blocked' && <p>{t('push.blocked')}</p>}
      {status.state === 'unconfigured' && <p>{t('push.unconfigured')}</p>}
      {status.state === 'error' && (
        <button className="btn-secondary" onClick={load}>
          <RefreshCw size={16} />
          {t('push.retry')}
        </button>
      )}
    </section>
  );
}
