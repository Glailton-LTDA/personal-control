import React, { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/offline/db';
import { queueOwner } from '../../lib/offline/owner';
import { SyncEngine } from '../../lib/offline/SyncEngine';

export default function MFOfflineQueueNotice({ userId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [state, setState] = useState({ unknown: false, failed: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!userId) return undefined;
    const subscription = liveQuery(() => db.sync_queue.toArray()).subscribe((rows) => {
      const mf = rows.filter((row) => row.table_name?.startsWith('mf_'));
      setState({ unknown: mf.some((row) => !queueOwner(row)), failed: mf.some((row) => queueOwner(row) === userId && (row.attempts || 0) >= 5) });
    });
    return () => subscription.unsubscribe();
  }, [userId]);
  if (!userId || (!state.unknown && !state.failed)) return null;
  const retry = async () => {
    setBusy(true);
    const engine = new SyncEngine(userId, { providers: [] });
    try {
      await db.sync_queue.toCollection().modify((row) => {
        if (row.table_name?.startsWith('mf_') && queueOwner(row) === userId) row.attempts = 0;
      });
      await engine.sync({ pull: false });
      await client.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('mf-') });
    } finally { engine.destroy(); setBusy(false); }
  };
  return <div role="status" data-testid="mf-offline-queue-notice" style={{ padding: '0.75rem', color: 'var(--text-main)', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: 10, marginBottom: '0.5rem' }}>
    {state.unknown && <p>{t('minhasfinancas.offline_legacy_queue')}</p>}
    {state.failed && <><p>{t('minhasfinancas.offline_failed_queue')}</p><button type="button" disabled={busy} onClick={retry}>{t('minhasfinancas.offline_retry_queue')}</button></>}
  </div>;
}
