import React, { useId, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  MAX_DAYS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_TIMES,
  validateTreatment,
  scheduleFromTreatment,
  previewTreatment,
  slotsByLocalDate,
  formatLocalTime,
  TIME_PATTERN,
} from '../../lib/treatmentEngine';
import { useSaveTreatment } from '../../hooks/useTreatments';
import { HealthModal } from './HealthUI';

const DAY_MS = 86400000;

function emptyForm(isEdit, record) {
  const now = new Date();
  const iso = (d) => d.toISOString();
  const localDate = (d) => iso(d).slice(0, 10);
  const localTime = (d) => iso(d).slice(11, 16);
  const base = {
    name: record?.name || '',
    dose: record?.dose || '',
    presentation_code: record?.presentation_code || '',
    dose_quantity: record?.dose_quantity == null ? '' : String(record?.dose_quantity),
    dose_unit_code: record?.dose_unit_code || '',
    professional_name: record?.professional_name || '',
    indication: record?.indication || '',
    pharmacy: record?.pharmacy || '',
    batch: record?.batch || '',
    notes: record?.notes || '',
    timezone: record?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    reminders_enabled: record?.reminders_enabled ?? true,
    reminder_offset_minutes: record?.reminder_offset_minutes == null ? '' : String(record?.reminder_offset_minutes),
    mode: record?.mode || 'daily_times',
    duration_kind: record?.duration_kind || 'continuous',
    duration_days: record?.duration_days == null ? '' : String(record?.duration_days),
    anchor_date: record?.starts_on ? localDate(new Date(record.starts_on + 'T12:00:00Z')) : localDate(now),
    anchor_time: record?.anchor_at ? localTime(new Date(record.anchor_at)) : localTime(now),
    interval_minutes: record?.interval_minutes == null ? '120' : String(record?.interval_minutes),
    local_start_date: record?.local_start_date || localDate(now),
    local_times: Array.isArray(record?.local_times) ? [...record.local_times] : ['08:00'],
    id: record?.id || '',
    row_version: record?.row_version ?? 0,
  };
  if (isEdit && record) {
    base.expected_version = record.row_version;
  }
  return base;
}

export default function TreatmentForm({
  userId,
  record,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const isEdit = Boolean(record);
  const [form, setForm] = useState(() => emptyForm(isEdit, record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef([]);
  const { mutate: saveTreatment, isPending: saving } = useSaveTreatment(userId);

  const set = (field, value) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const toggleTime = (time) =>
    setForm((previous) => {
      const times = previous.local_times.includes(time)
        ? previous.local_times.filter((t) => t !== time)
        : [...previous.local_times, time].sort();
      return { ...previous, local_times: times };
    });

  const addTime = () =>
    setForm((previous) => {
      if (previous.local_times.length >= MAX_TIMES) return previous;
      const times = [...previous.local_times, '12:00'].sort();
      return { ...previous, local_times: times };
    });

  const schedule = useMemo(() => scheduleFromTreatment(form), [form]);

  // Recompute preview whenever the schedule or timezone changes.
  useMemo(() => {
    previewRef.current = previewTreatment(schedule, Date.now(), 14);
  }, [schedule]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const validation = validateTreatment(form);
      if (validation.length) {
        setError(validation[0]);
        return;
      }
      const built = scheduleFromTreatment(form);
      if (!built) {
        setError('invalid_local_time');
        return;
      }
      const payload = {
        ...form,
        schedule: built,
        duration_days:
          form.duration_kind === 'finite'
            ? Number(form.duration_days)
            : null,
        interval_minutes: form.mode === 'interval' ? Number(form.interval_minutes) : undefined,
      };
      const result = await saveTreatment(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved(result.data?.id);
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  };

  const isInterval = form.mode === 'interval';
  const isFinite = form.duration_kind === 'finite';
  const isDaily = form.mode === 'daily_times';

  const title = isEdit
    ? t('health.edit_treatment')
    : t('health.new_treatment');

  return (
    <HealthModal title={title} onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="health-form">
        <fieldset disabled={saving} className="health-form-grid">
          <label className="health-field health-full">
            <span>{t('health.treatment_name')}</span>
            <input
              id={`${inputId}-name`}
              name="name"
              required
              maxLength={255}
              value={form.name || ''}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.treatment_dose')}</span>
            <input
              id={`${inputId}-dose`}
              name="dose"
              required
              maxLength={255}
              value={form.dose || ''}
              onChange={(e) => set('dose', e.target.value)}
            />
          </label>
          <div className="health-field health-full">
            <span>{t('health.treatment_dose_quantity')} / {t('health.treatment_dose_unit')}</span>
            <div className="health-row" style={{ gap: '0.6rem', alignItems: 'flex-end' }}>
              <input
                id={`${inputId}-qty`}
                type="number"
                min="0"
                max="1000000"
                step="any"
                value={form.dose_quantity || ''}
                onChange={(e) => set('dose_quantity', e.target.value)}
                placeholder={t('health.treatment_dose_quantity')}
              />
              <input
                id={`${inputId}-unit`}
                name="dose_unit_code"
                maxLength={50}
                value={form.dose_unit_code || ''}
                onChange={(e) => set('dose_unit_code', e.target.value)}
                placeholder={t('health.treatment_dose_unit')}
              />
            </div>
          </div>
          <label className="health-field health-full">
            <span>{t('health.treatment_professional_name')}</span>
            <input
              id={`${inputId}-prof`}
              name="professional_name"
              maxLength={255}
              value={form.professional_name || ''}
              onChange={(e) => set('professional_name', e.target.value)}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.treatment_indication')}</span>
            <input
              id={`${inputId}-ind`}
              name="indication"
              maxLength={1000}
              value={form.indication || ''}
              onChange={(e) => set('indication', e.target.value)}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.treatment_pharmacy')}</span>
            <input
              id={`${inputId}-pharm`}
              name="pharmacy"
              maxLength={255}
              value={form.pharmacy || ''}
              onChange={(e) => set('pharmacy', e.target.value)}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.treatment_batch')}</span>
            <input
              id={`${inputId}-batch`}
              name="batch"
              maxLength={100}
              value={form.batch || ''}
              onChange={(e) => set('batch', e.target.value)}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.treatment_notes')}</span>
            <textarea
              id={`${inputId}-notes`}
              name="notes"
              rows={3}
              maxLength={20000}
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>

          <fieldset className="health-times health-full">
            <legend>{t('health.treatment_mode')}</legend>
            <div className="health-row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <label className="health-check">
                <input
                  type="radio"
                  name="mode"
                  value="interval"
                  checked={isInterval}
                  onChange={() => set('mode', 'interval')}
                />
                {t('health.treatment_mode_interval')}
              </label>
              <label className="health-check">
                <input
                  type="radio"
                  name="mode"
                  value="daily_times"
                  checked={isDaily}
                  onChange={() => set('mode', 'daily_times')}
                />
                {t('health.treatment_mode_daily_times')}
              </label>
            </div>
          </fieldset>

          <fieldset className="health-times health-full">
            <legend>{t('health.treatment_duration')}</legend>
            <div className="health-row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <label className="health-check">
                <input
                  type="radio"
                  name="duration_kind"
                  value="finite"
                  checked={isFinite}
                  onChange={() => set('duration_kind', 'finite')}
                />
                {t('health.treatment_duration_finite')}
              </label>
              <label className="health-check">
                <input
                  type="radio"
                  name="duration_kind"
                  value="continuous"
                  checked={!isFinite}
                  onChange={() => set('duration_kind', 'continuous')}
                />
                {t('health.treatment_duration_continuous')}
              </label>
            </div>
            {isFinite && (
              <div className="health-field">
                <span>{t('health.treatment_duration_days')}</span>
                <input
                  id={`${inputId}-days`}
                  type="number"
                  min="1"
                  max={MAX_DAYS}
                  value={form.duration_days || ''}
                  onChange={(e) => set('duration_days', e.target.value)}
                />
                <p className="health-muted">
                  {t('health.treatment_duration_days')} (1 a {MAX_DAYS})
                </p>
              </div>
            )}
          </fieldset>

          {isInterval && (
            <>
              <label className="health-field">
                <span>{t('health.treatment_anchor_date')}</span>
                <input
                  id={`${inputId}-anchor-date`}
                  type="date"
                  required
                  value={form.anchor_date || ''}
                  onChange={(e) => set('anchor_date', e.target.value)}
                />
              </label>
              <label className="health-field">
                <span>{t('health.treatment_anchor_time')}</span>
                <input
                  id={`${inputId}-anchor-time`}
                  type="time"
                  required
                  value={form.anchor_time || ''}
                  onChange={(e) => set('anchor_time', e.target.value)}
                />
              </label>
              <label className="health-field">
                <span>{t('health.treatment_interval_minutes')}</span>
                <input
                  id={`${inputId}-interval`}
                  type="number"
                  min={MIN_INTERVAL_MINUTES}
                  max={MAX_INTERVAL_MINUTES}
                  step="1"
                  required
                  value={form.interval_minutes || ''}
                  onChange={(e) => set('interval_minutes', e.target.value)}
                />
                <p className="health-muted">
                  {MIN_INTERVAL_MINUTES} a {MAX_INTERVAL_MINUTES} minutos
                </p>
              </label>
            </>
          )}

          {isDaily && (
            <>
              <label className="health-field">
                <span>{t('health.treatment_local_start_date')}</span>
                <input
                  id={`${inputId}-start-date`}
                  type="date"
                  required
                  value={form.local_start_date || ''}
                  onChange={(e) => set('local_start_date', e.target.value)}
                />
              </label>
              <fieldset className="health-times health-full">
                <legend>{t('health.treatment_local_times')}</legend>
                <div className="health-time-grid">
                  {form.local_times.map((time, index) => (
                    <div className="health-row" key={index}>
                      <input
                        type="time"
                        required
                        value={time}
                        aria-label={t('health.treatment_local_times')}
                        onChange={(e) => {
                          const times = [...form.local_times];
                          times[index] = e.target.value.slice(0, 5);
                          set('local_times', times.sort());
                        }}
                      />
                      <button
                        type="button"
                        className="health-icon"
                        aria-label={t('health.remove_time')}
                        onClick={() => toggleTime(time)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={form.local_times.length >= MAX_TIMES || saving}
                  onClick={addTime}
                >
                  <Plus size={16} />
                  {t('health.add_time')}
                </button>
              </fieldset>
            </>
          )}

          <label className="health-field">
            <span>{t('health.treatment_timezone')}</span>
            <input
              id={`${inputId}-tz`}
              name="timezone"
              required
              maxLength="100"
              value={form.timezone || ''}
              onChange={(e) => set('timezone', e.target.value)}
            />
            <p className="health-muted">
              {t('health.treatment_timezone')} (detetado do aparelho)
            </p>
          </label>

          <fieldset className="health-times health-full">
            <legend>{t('health.treatment_reminders_enabled')}</legend>
            <label className="health-check">
              <input
                type="checkbox"
                checked={form.reminders_enabled}
                onChange={(e) => set('reminders_enabled', e.target.checked)}
              />
              {t('health.treatment_reminders_enabled')}
            </label>
            <div className="health-field">
              <span>{t('health.treatment_reminder_offset_minutes')}</span>
              <input
                id={`${inputId}-offset`}
                type="number"
                min="0"
                max={MAX_INTERVAL_MINUTES}
                value={form.reminder_offset_minutes || ''}
                onChange={(e) => set('reminder_offset_minutes', e.target.value)}
              />
            </div>
          </fieldset>

          <label className="health-field health-full">
            <span>{t('health.treatment_preview')}</span>
            <div className="health-preview-wrap">
              {previewRef.current.length === 0 ? (
                <p className="health-muted">{t('health.treatment_no_slots')}</p>
              ) : (
                <ul className="health-preview-list">
                  {slotsByLocalDate(previewRef.current, form.timezone).map(
                    ({ date, slots }) => (
                      <li key={date} className="health-preview-day">
                        <strong>{date}</strong>
                        <ul className="health-preview-slots">
                          {slots.map((instant) => (
                            <li key={instant}>
                              {formatLocalTime(instant, form.timezone)}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="health-error">
            {t(`health.${error}`)}
          </p>
        )}
        <footer className="health-actions">
          <button
            type="button"
            disabled={saving}
            className="btn-secondary"
            onClick={onClose}
          >
            {t('health.cancel')}
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving ? t('health.loading') : isEdit ? t('health.treatment_updated') : t('health.treatment_saved')}
          </button>
        </footer>
      </form>
    </HealthModal>
  );
}
