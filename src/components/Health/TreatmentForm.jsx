import React, { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MAX_DURATION_DAYS,
  MAX_TIMES,
  deviceTimeZone,
  validateTreatment,
  scheduleFromTreatment,
  previewTreatment,
  slotsByLocalDate,
  formatLocalTime,
  formatLocalDate,
  countSlots,
  buildSlots,
} from "../../lib/treatmentEngine";
import { useSaveTreatment } from "../../hooks/useTreatments";
import { HealthLinkSelect, HealthModal } from "./HealthUI";

function initialForm(record) {
  const schedule = record?.schedule || {};
  const timezone = schedule.timezone || record?.timezone || deviceTimeZone();
  const now = Date.now();
  const anchor = schedule.anchor_at
    ? new Date(schedule.anchor_at).getTime()
    : now;
  return {
    name: record?.name || "",
    dose: record?.dose || "",
    presentation_code: record?.presentation_code || "",
    dose_quantity: record?.dose_quantity ?? "",
    dose_unit_code: record?.dose_unit_code || "",
    professional_name: record?.professional_name || "",
    indication: record?.indication || "",
    pharmacy: record?.pharmacy || "",
    batch: record?.batch || "",
    notes: record?.notes || "",
    condition_id: record?.condition_id || "",
    appointment_id: record?.appointment_id || "",
    timezone,
    reminders_enabled: record?.reminders_enabled ?? true,
    reminder_offset_minutes: record?.reminder_offset_minutes ?? 0,
    mode: schedule.mode || record?.mode || "interval",
    duration_kind: schedule.duration_kind || record?.duration_kind || "finite",
    duration_days: schedule.duration_days || record?.duration_days || 7,
    anchor_date: timezone ? formatLocalDate(anchor, timezone) : "",
    anchor_time: timezone ? formatLocalTime(anchor, timezone) : "",
    interval_minutes:
      schedule.interval_minutes || record?.interval_minutes || 480,
    local_start_date:
      schedule.local_start_date ||
      (timezone ? formatLocalDate(now, timezone) : ""),
    local_times: (schedule.local_times || record?.local_times || ["08:00"]).map(
      (time) => time.slice(0, 5),
    ),
    ...(record?.id
      ? {
          id: record.id,
          expected_version: record.row_version,
          row_version: record.row_version,
        }
      : {}),
  };
}

export default function TreatmentForm({ userId, record, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(() => initialForm(record));
  const [dirty, setDirty] = useState(false);
  const [doseDirty, setDoseDirty] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const save = useSaveTreatment(userId);
  const set = (key, value) => {
    if (["dose_quantity", "dose_unit_code"].includes(key)) setDoseDirty(true);
    request.current = null;
    setDirty(true);
    setForm((old) => ({ ...old, [key]: value }));
  };
  const schedule = useMemo(() => scheduleFromTreatment(form), [form]);
  const total = useMemo(() => countSlots(schedule), [schedule]);
  const slots = useMemo(() => {
    if (!schedule) return [];
    const first = schedule.anchor_at || schedule.effective_from;
    return previewTreatment(
      schedule,
      Math.max(Date.now(), new Date(first).getTime()),
    );
  }, [schedule]);
  const last = useMemo(() => {
    if (!schedule?.end_exclusive_at) return null;
    const values = buildSlots(
      schedule,
      new Date(new Date(schedule.end_exclusive_at).getTime() - 8 * 86400000),
      schedule.end_exclusive_at,
    );
    return values.at(-1);
  }, [schedule]);
  const date = (value) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: form.timezone,
    }).format(new Date(value));
  const close = () => {
    if (
      !save.isPending &&
      (!dirty || window.confirm(t("health.discard_treatment")))
    )
      onClose();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (save.isPending) return;
    const quantity = Number(form.dose_quantity);
    const unit = form.dose_unit_code.trim();
    const changingDose = !record || doseDirty;
    if (changingDose && (!unit || !Number.isFinite(quantity) || quantity <= 0 || Math.round(quantity * 1000) / 1000 !== quantity)) {
      setError("invalid_dose");
      return;
    }
    const dose = changingDose ? t("health.dose_description", {
      quantity: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(quantity),
      unit,
    }) : form.dose;
    const values = { ...form, dose, dose_unit_code: unit };
    const errors = validateTreatment(values);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    request.current ||= crypto.randomUUID();
    setError("");
    try {
      const result = await save.mutateAsync({
        ...values,
        requestId: request.current,
      });
      onSaved(result.id);
    } catch (err) {
      setError(err.message);
    }
  };
  const field = (key, options = {}) => (
    <label className="health-field">
      <span>{t(`health.treatment_${key}`)}</span>
      <input
        name={key}
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        {...options}
      />
    </label>
  );
  return (
    <HealthModal
      title={t(record ? "health.edit_treatment" : "health.new_treatment")}
      onClose={close}
    >
      <form onSubmit={submit} className="health-form">
        <fieldset disabled={save.isPending} className="health-form-grid">
          <div className="health-full">
            {field("name", { required: true, maxLength: 255 })}
          </div>
          <label className="health-field">
            <span>{t("health.presentation")}</span>
            <select
              value={form.presentation_code}
              onChange={(e) => set("presentation_code", e.target.value)}
            >
              {["", "tablet", "drops", "syrup", "ointment", "other"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`health.presentation_${value || "choose"}`)}
                  </option>
                ),
              )}
            </select>
          </label>
          {field("dose_quantity", {
            type: "number",
            required: !record || doseDirty,
            min: "0.001",
            max: "1000000",
            step: "any",
          })}
          {field("dose_unit_code", { maxLength: 50, required: !record || doseDirty })}
          {record && (!record.dose_quantity || !record.dose_unit_code?.trim()) && <p className="health-muted health-full">{t("health.legacy_dose_hint", { dose: record.dose })}</p>}
          <fieldset className="health-times health-full">
            <legend>{t("health.treatment_mode")}</legend>
            <div className="health-actions">
              {["interval", "daily_times"].map((mode) => (
                <label key={mode} className="health-check">
                  <input
                    type="radio"
                    name="mode"
                    checked={form.mode === mode}
                    onChange={() => set("mode", mode)}
                  />
                  {t(`health.treatment_mode_${mode}`)}
                </label>
              ))}
            </div>
          </fieldset>
          {form.mode === "interval" ? (
            <>
              <div className="health-full health-actions">
                {[6, 8, 12, 24].map((hours) => (
                  <button
                    type="button"
                    className={
                      Number(form.interval_minutes) === hours * 60
                        ? "btn-primary"
                        : "btn-secondary"
                    }
                    aria-pressed={Number(form.interval_minutes) === hours * 60}
                    key={hours}
                    onClick={() => set("interval_minutes", hours * 60)}
                  >
                    {t("health.every_hours", { count: hours })}
                  </button>
                ))}
              </div>
              <label className="health-field">
                <span>{t("health.interval_hours")}</span>
                <input
                  type="number"
                  min="1"
                  max="168"
                  step="1"
                  required
                  value={Number(form.interval_minutes) / 60 || ""}
                  onChange={(e) =>
                    set("interval_minutes", Number(e.target.value) * 60)
                  }
                />
              </label>
              {field("anchor_date", { type: "date", required: true })}
              {field("anchor_time", { type: "time", required: true })}
            </>
          ) : (
            <>
              {field("local_start_date", { type: "date", required: true })}
              <fieldset className="health-times health-full">
                <legend>{t("health.treatment_local_times")}</legend>
                <div className="health-time-grid">
                  {form.local_times.map((time, index) => (
                    <div className="health-row" key={index}>
                      <input
                        type="time"
                        required
                        aria-label={t("health.treatment_local_times")}
                        value={time}
                        onChange={(e) =>
                          set(
                            "local_times",
                            form.local_times.map((value, i) =>
                              i === index ? e.target.value : value,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="health-icon"
                        aria-label={t("health.remove_time")}
                        onClick={() =>
                          set(
                            "local_times",
                            form.local_times.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={form.local_times.length >= MAX_TIMES}
                  onClick={() =>
                    set("local_times", [...form.local_times, "12:00"])
                  }
                >
                  <Plus size={16} />
                  {t("health.add_time")}
                </button>
              </fieldset>
            </>
          )}
          <label className="health-check health-full">
            <input
              type="checkbox"
              checked={form.duration_kind === "continuous"}
              onChange={(e) =>
                set("duration_kind", e.target.checked ? "continuous" : "finite")
              }
            />
            {t("health.treatment_duration_continuous")}
          </label>
          {form.duration_kind === "finite" &&
            field("duration_days", {
              type: "number",
              min: 1,
              max: MAX_DURATION_DAYS,
              required: true,
            })}
          {!form.timezone && (
            <label className="health-field health-full">
              <span>{t("health.resolve_timezone")}</span>
              <select
                required
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              >
                <option value="">{t("health.choose_timezone")}</option>
                {Intl.supportedValuesOf("timeZone").map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
            </label>
          )}
          <section
            className="glass-card health-card health-full health-treatment-preview"
            aria-live="polite"
          >
            <h3>{t("health.treatment_preview")}</h3>
            {form.duration_kind === "continuous" ? (
              <p>{t("health.treatment_duration_continuous")}</p>
            ) : (
              <p>{t("health.predicted_doses", { count: total || 0 })}</p>
            )}
            {last != null && (
              <p>{t("health.last_dose", { date: date(last) })}</p>
            )}
            <p className="health-muted">
              {t("health.timezone_snapshot", { timezone: form.timezone })}
            </p>
            {slots.length ? (
              <ul className="health-preview-list">
                {slotsByLocalDate(slots, form.timezone)
                  .slice(0, 3)
                  .map((group) => (
                    <li key={group.date}>
                      <strong>
                        {new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(new Date(group.date + "T12:00:00Z"))}
                      </strong>
                      <ul className="health-preview-slots">
                        {group.slots.map((slot) => (
                          <li key={slot}>
                            {formatLocalTime(slot, form.timezone)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>{t("health.treatment_no_slots")}</p>
            )}
            {record && (
              <p className="health-muted">{t("health.future_revision_hint")}</p>
            )}
          </section>
          <label className="health-check health-full">
            <input
              type="checkbox"
              checked={form.reminders_enabled}
              onChange={(e) => set("reminders_enabled", e.target.checked)}
            />
            {t("health.treatment_reminders_enabled")}
          </label>
          {form.reminders_enabled && (
            <label className="health-field health-full">
              <span>{t("health.treatment_reminder_offset_minutes")}</span>
              <select
                value={form.reminder_offset_minutes}
                onChange={(e) =>
                  set("reminder_offset_minutes", Number(e.target.value))
                }
              >
                {[
                  ...new Set([
                    0,
                    5,
                    10,
                    15,
                    30,
                    60,
                    1440,
                    Number(form.reminder_offset_minutes),
                  ]),
                ].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t(
                      minutes
                        ? "health.remind_minutes_before"
                        : "health.remind_on_time",
                      { count: minutes },
                    )}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="health-muted health-full">
            {t("health.global_push_hint")}{" "}
            <a href="/settings/general">{t("health.app_settings")}</a>
          </p>
          <details className="health-full">
            <summary>{t("health.additional_information")}</summary>
            <div className="health-form-grid">
              {field("professional_name", { maxLength: 255 })}
              {field("indication", { maxLength: 1000 })}
              {field("pharmacy", { maxLength: 255 })}
              {field("batch", { maxLength: 100 })}
              <label className="health-field health-full">
                <span>{t("health.treatment_notes")}</span>
                <textarea
                  rows={3}
                  maxLength={20000}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </label>
              {["conditions", "appointments"].map((kind) => (
                <HealthLinkSelect
                  key={kind}
                  userId={userId}
                  kind={kind}
                  field={
                    kind === "conditions" ? "condition_id" : "appointment_id"
                  }
                  value={
                    form[
                      kind === "conditions" ? "condition_id" : "appointment_id"
                    ]
                  }
                  onChange={(value) =>
                    set(
                      kind === "conditions" ? "condition_id" : "appointment_id",
                      value,
                    )
                  }
                />
              ))}
              <p className="health-muted health-full">
                {t("health.attach_after_save")}
              </p>
            </div>
          </details>
        </fieldset>
        {error && (
          <p className="health-error" role="alert">
            {t(`health.${error}`, { defaultValue: t("health.error") })}
          </p>
        )}
        <footer className="health-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={save.isPending}
            onClick={close}
          >
            {t("health.cancel")}
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {t(save.isPending ? "health.loading" : "health.save")}
          </button>
        </footer>
      </form>
    </HealthModal>
  );
}
