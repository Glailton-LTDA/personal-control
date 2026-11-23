import React, { useState, useEffect, useRef } from "react";
import { Check, Clock, Edit, Pill } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useRecordDose,
  useUndoDose,
  useTreatmentState,
  useTreatmentDetail,
} from "../../hooks/useTreatments";
import { deviceTimeZone, scheduleLabel } from "../../lib/treatmentEngine";
import {
  HealthDate,
  HealthModal,
  HealthStatus,
  HealthLoading,
  HealthError,
} from "./HealthUI";

const statusKeys = {
  taken: "status_taken",
  skipped: "status_skipped",
  missed: "dose_overdue",
  scheduled: "status_scheduled",
  canceled: "status_cancelled",
};

export default function TreatmentCard({ record, userId, navigate, onForm }) {
  const { t, i18n } = useTranslation();
  const save = useRecordDose(userId);
  const undo = useUndoDose(userId);
  const state = useTreatmentState(userId);
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");
  const doseFlight = useRef(false);
  const doseCommand = useRef(null);
  const editQuery = useTreatmentDetail(
    userId,
    record.id,
    action?.kind === "edit",
  );
  useEffect(() => {
    if (
      action?.kind === "edit" &&
      editQuery.isSuccess &&
      editQuery.data?.medication
    ) {
      setAction(null);
      onForm?.({
        kind: "medications",
        record: {
          ...editQuery.data.medication,
          schedule: editQuery.data.schedule,
        },
      });
    }
  }, [action, editQuery.isSuccess, editQuery.data, onForm]);
  const busy = save.isPending || undo.isPending || state.isPending;
  const timezone =
    record.schedule?.timezone || record.timezone || deviceTimeZone();
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          timeZone: timezone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : t("health.no_date");
  const slots = record.today?.slots || [];
  const time = (value) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const open = (kind, slot) => {
    setError("");
    setAction({
      kind,
      slot,
      requestId: crypto.randomUUID(),
      takenAt: new Date().toISOString(),
    });
  };
  const toggleDose = async (slot) => {
    if (
      busy ||
      doseFlight.current ||
      record.status === "finished" ||
      slot.status === "canceled" ||
      new Date(slot.scheduled_at).getTime() > Date.now()
    )
      return;
    doseFlight.current = true;
    setError("");
    const undoing = ["taken", "skipped"].includes(slot.status);
    const key = JSON.stringify([
      slot.scheduled_at,
      slot.status,
      slot.record_version,
      slot.planned_amount,
    ]);
    if (doseCommand.current?.key !== key) {
      doseCommand.current = {
        key,
        requestId: crypto.randomUUID(),
        takenAt: new Date().toISOString(),
      };
    }
    const { requestId, takenAt } = doseCommand.current;
    try {
      if (undoing) {
        await undo.mutateAsync({
          medicationId: record.id,
          scheduledAt: slot.scheduled_at,
          expectedVersion: slot.record_version,
          requestId,
        });
      } else {
        await save.mutateAsync({
          medicationId: record.id,
          scheduledAt: slot.scheduled_at,
          status: "taken",
          requestId,
          options: {
            expectedVersion: slot.record_version || 0,
            takenAt,
            amount: slot.planned_amount || record.dose,
          },
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      doseFlight.current = false;
    }
  };
  const submit = async () => {
    if (busy) return;
    setError("");
    try {
      await state.mutateAsync({
        medicationId: record.id,
        action: "finish",
        requestId: action.requestId,
        options: { expectedVersion: record.row_version },
      });
      setAction(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const view = () => navigate(`health/medications/${record.id}`);
  return (
    <article className="glass-card health-card health-dose-card">
      <header className="health-dose-card-heading">
        <Pill size={24} aria-hidden="true" />
        <div className="health-grow">
          <button className="health-treatment-link" onClick={() => view()}>
            {record.name}
          </button>
          <HealthStatus status={record.status} />
          <p className="health-muted">
            {record.dose} · {scheduleLabel(record.schedule, t)}
          </p>
        </div>
        {onForm && (
          <button
            className="btn-secondary health-icon"
            aria-label={t("health.edit_named_treatment", { name: record.name })}
            onClick={() => open("edit")}
          >
            <Edit size={18} />
          </button>
        )}
      </header>
      {record.total_predicted != null ? (
        <>
          <p>
            {t("health.taken_of_planned", {
              taken: record.taken_total,
              planned: record.total_predicted,
            })}
          </p>
          <progress
            aria-label={t("health.treatment_summary")}
            value={record.taken_total}
            max={Math.max(record.total_predicted, 1)}
          />
          {record.ends_on && (
            <p className="health-muted">
              {t("health.ends_on")}:{" "}
              <HealthDate value={record.ends_on} dateOnly />
            </p>
          )}
        </>
      ) : (
        <p>{t("health.treatment_duration_continuous")}</p>
      )}
      {record.last_taken_at && (
        <p className="health-dose-info">
          <Clock size={16} />
          {t("health.last_taken")}:{" "}
          <time dateTime={record.last_taken_at}>
            {date(record.last_taken_at)}
          </time>
        </p>
      )}
      <p className="health-dose-info">
        {t("health.next_dose")}: <span>{date(record.next_at)}</span>
      </p>
      <h3>{t("health.today_doses")}</h3>
      {slots.length ? (
        <div className="health-dose-buttons">
          {slots.map((slot) => {
            const future = new Date(slot.scheduled_at).getTime() > Date.now();
            const disabled =
              busy ||
              future ||
              slot.status === "canceled" ||
              record.status === "finished";
            const label = t(`health.${statusKeys[slot.status] || "scheduled"}`);
            return (
              <button
                key={slot.scheduled_at}
                className={`health-dose-button health-dose-${slot.status}`}
                disabled={disabled}
                aria-label={t("health.dose_at_status", {
                  time: time(slot.scheduled_at),
                  status: label,
                })}
                aria-pressed={slot.status === "taken"}
                onClick={() => toggleDose(slot)}
              >
                <span>
                  {slot.status === "taken" ? (
                    <Check size={20} />
                  ) : (
                    <Clock size={20} />
                  )}
                  <strong>{time(slot.scheduled_at)}</strong>
                </span>
                <small>{label}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="health-muted">{t("health.treatment_no_slots")}</p>
      )}
      <p className="health-muted">{t("health.dose_card_hint")}</p>
      {error && !action && (
        <p role="alert" className="health-error">
          {t(`health.${error}`, { defaultValue: t("health.error") })}
        </p>
      )}
      <footer className="health-actions health-dose-card-footer">
        <button className="btn-secondary" onClick={() => view()}>
          {t("health.view_treatment")}
        </button>
        {record.status !== "finished" && (
          <button
            className="btn-secondary health-danger"
            disabled={busy}
            onClick={() => open("finish")}
          >
            {t("health.treatment_finish")}
          </button>
        )}
      </footer>
      {action?.kind === "edit" && (
        <HealthModal
          title={t("health.edit_treatment")}
          onClose={() => setAction(null)}
        >
          {editQuery.isError ? (
            <HealthError query={editQuery} />
          ) : (
            <HealthLoading />
          )}
        </HealthModal>
      )}
      {action?.kind === "finish" && (
        <HealthModal
          title={t("health.treatment_finish")}
          onClose={() => !busy && setAction(null)}
        >
          <p>
            <strong>{record.name}</strong>
          </p>
          <p>{t("health.finish_impact")}</p>
          {error && (
            <p role="alert" className="health-error">
              {t(`health.${error}`, { defaultValue: t("health.error") })}
            </p>
          )}
          <div className="health-actions">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              {t("health.cancel")}
            </button>
            <button className="btn-primary" disabled={busy} onClick={submit}>
              {t("health.confirm")}
            </button>
          </div>
        </HealthModal>
      )}
    </article>
  );
}
