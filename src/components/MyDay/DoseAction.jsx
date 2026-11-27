import React, { useRef, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRecordDose, useUndoDose } from '../../hooks/useTreatments';
import { requireMyDaySession } from '../../lib/myDay';

export default function DoseAction({ item, userId, now }) {
  const { t } = useTranslation();
  const record = useRecordDose(userId),
    undo = useUndoDose(userId);
  const flight = useRef(false),
    command = useRef(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  const taken = ['taken', 'skipped'].includes(item.status);
  const disabled =
    pending ||
    record.isPending ||
    undo.isPending ||
    new Date(item.scheduled_at) > now ||
    item.status === 'canceled';
  const toggle = async () => {
    if (disabled || flight.current || !userId) return;
    flight.current = true;
    setPending(true);
    setError(false);
    const key = JSON.stringify([
      item.key,
      item.status,
      item.record_version,
      item.dose,
    ]);
    if (command.current?.key !== key)
      command.current = {
        key,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      };
    try {
      await requireMyDaySession(userId);
      const args = {
        medicationId: item.medication_id,
        scheduledAt: item.scheduled_at,
        requestId: command.current.id,
      };
      if (taken)
        await undo.mutateAsync({
          ...args,
          expectedVersion: item.record_version,
        });
      else
        await record.mutateAsync({
          ...args,
          status: 'taken',
          options: {
            expectedVersion: item.record_version || 0,
            takenAt: command.current.at,
            amount: item.dose,
          },
        });
      command.current = null;
    } catch {
      setError(true);
    } finally {
      flight.current = false;
      setPending(false);
    }
  };
  return (
    <div className="my-day-dose-action">
      <button
        type="button"
        className={taken ? 'btn-secondary' : 'btn-primary'}
        disabled={disabled}
        onClick={toggle}
        aria-label={t(taken ? 'myDay.undo_named' : 'myDay.take_named', {
          name: item.title,
        })}
      >
        {taken ? <Undo2 size={16} /> : <Check size={16} />}
        {t(pending ? 'myDay.saving' : taken ? 'myDay.undo' : 'myDay.take')}
      </button>
      {error && <p role="alert">{t('myDay.action_error')}</p>}
    </div>
  );
}
