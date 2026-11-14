import React, { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Edit,
  FileText,
  History,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useTreatmentDetail,
  useTreatmentCalendar,
  useTreatmentHistory,
  useTreatmentState,
  useRecordDose,
  useUndoDose,
} from "../../hooks/useTreatments";
import {
  addDays,
  deviceTimeZone,
  formatLocalDate,
  formatLocalTime,
  localInstant,
  scheduleLabel,
} from "../../lib/treatmentEngine";
import HealthDocuments from "./HealthDocuments";
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthModal,
  HealthStatus,
} from "./HealthUI";

const STATUS = {
  scheduled: "scheduled",
  missed: "treatment_overdue",
  taken: "status_taken",
  skipped: "status_skipped",
  canceled: "status_cancelled",
};

export default function TreatmentDetail({
  userId,
  medicationId,
  navigate,
  onForm,
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState("summary");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [filter, setFilter] = useState("all");
  const [cursors, setCursors] = useState([null]);
  const [recording, setRecording] = useState(null);
  const [stateAction, setStateAction] = useState(null);
  const [error, setError] = useState("");
  const detail = useTreatmentDetail(userId, medicationId);
  const medication = detail.data?.medication;
  const schedule = detail.data?.schedule;
  const stats = detail.data?.stats;
  const timezone =
    schedule?.timezone || medication?.timezone || deviceTimeZone() || "UTC";
  const today = formatLocalDate(Date.now(), timezone);
  const month = new Date(today.slice(0, 7) + "-01T12:00:00Z");
  month.setUTCMonth(month.getUTCMonth() + monthOffset);
  const start = month.toISOString().slice(0, 10);
  const end = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12),
  )
    .toISOString()
    .slice(0, 10);
  const calendar = useTreatmentCalendar(
    userId,
    medicationId,
    tab === "summary" ? addDays(today, -6) : start,
    tab === "summary" ? today : end,
    detail.isSuccess && tab !== "history" && tab !== "documents",
  );
  const history = useTreatmentHistory(
    userId,
    medicationId,
    { filter, cursorAt: cursors.at(-1) || undefined },
    detail.isSuccess && tab === "history",
  );
  const state = useTreatmentState(userId);
  const record = useRecordDose(userId);
  const undo = useUndoDose(userId);
  const busy = state.isPending || record.isPending || undo.isPending;
  const date = (value, timeOnly = false) =>
    new Intl.DateTimeFormat(
      i18n.language,
      timeOnly
        ? { hour: "2-digit", minute: "2-digit", timeZone: timezone }
        : { dateStyle: "medium", timeStyle: "short", timeZone: timezone },
    ).format(new Date(value));
  const localDateLabel = (value) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  const openDose = (slot) => {
    setError("");
    const actual = slot.taken_at
      ? new Date(slot.taken_at).getTime()
      : Date.now();
    setRecording({
      scheduledAt: slot.scheduled_at,
      status: slot.status === "skipped" ? "skipped" : "taken",
      takenLocal: `${formatLocalDate(actual, timezone)}T${formatLocalTime(actual, timezone)}`,
      amount: slot.amount || slot.planned_amount || medication.dose,
      reason: slot.reason === "retroactive_at_creation" ? t("health.retroactive_dose_reason") : slot.reason || "",
      expectedVersion: slot.record_version || 0,
      requestId: crypto.randomUUID(),
    });
  };
  const submitDose = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const [day, time] = recording.takenLocal.split("T");
    const instant = localInstant(day, time, timezone);
    if (recording.status === "taken" && instant == null) {
      setError("invalid_local_time");
      return;
    }
    try {
      await record.mutateAsync({
        medicationId,
        scheduledAt: recording.scheduledAt,
        status: recording.status,
        requestId: recording.requestId,
        options: {
          takenAt:
            recording.status === "taken"
              ? new Date(instant).toISOString()
              : null,
          amount: recording.amount,
          reason: recording.reason,
          expectedVersion: recording.expectedVersion,
        },
      });
      setRecording(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const undoSlot = async (slot) => {
    if (!window.confirm(t("health.confirm_undo_dose"))) return;
    setError("");
    try {
      await undo.mutateAsync({
        medicationId,
        scheduledAt: slot.scheduled_at,
        expectedVersion: slot.record_version,
      });
    } catch (err) {
      setError(err.message);
    }
  };
  const changeState = async () => {
    setError("");
    try {
      await state.mutateAsync({
        medicationId,
        action: stateAction.action,
        requestId: stateAction.requestId,
        options: { expectedVersion: medication.row_version },
      });
      setStateAction(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const renderSlot = (slot) => (
    <li
      key={slot.scheduled_at}
      className={`glass-card health-card health-treatment-slot health-treatment-slot-${slot.status}`}
    >
      <div className="health-grow">
        <strong>{date(slot.scheduled_at)}</strong>
        <p className="health-muted">{t("health.scheduled_at")}</p>
        <span className={`health-status health-status-${slot.status}`}>
          {t(`health.${STATUS[slot.status] || "scheduled"}`)}
        </span>
        {slot.taken_at && (
          <p>
            {t("health.taken_at")}: {date(slot.taken_at)}
          </p>
        )}
        {slot.amount && <p>{slot.amount}</p>}
        {slot.reason === "retroactive_at_creation" && (
          <p className="health-muted">{t("health.retroactive_dose_reason")}</p>
        )}
      </div>
      <div className="health-actions">
        {slot.status === "missed" && (
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => openDose(slot)}
          >
            {t("health.treatment_record_dose")}
          </button>
        )}
        {["taken", "skipped"].includes(slot.status) && (
          <>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => openDose(slot)}
            >
              {t("health.edit")}
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => undoSlot(slot)}
            >
              {t("health.treatment_undo_dose")}
            </button>
          </>
        )}
      </div>
    </li>
  );
  if (detail.isLoading) return <HealthLoading />;
  if (detail.isError) return <HealthError query={detail} />;
  if (!medication) return <HealthEmpty />;
  const dueSlot = (detail.data.today || [])
    .filter((slot) => slot.status === "missed")
    .at(-1);
  const days = calendar.data?.days || [];
  const chosen = days.find((day) => day.date === (selectedDay || today));
  const total = stats?.total_predicted;
  const regularity = stats?.due_recent
    ? Math.round((stats.taken_due / stats.due_recent) * 100)
    : null;
  return (
    <section className="health-section">
      <button
        className="btn-secondary health-back"
        onClick={() => navigate("health/medications")}
      >
        <ArrowLeft size={18} />
        {t("health.back")}
      </button>
      <header className="health-row">
        <div className="health-grow">
          <h2>{medication.name}</h2>
          <HealthStatus status={medication.status} />
          <p className="health-muted">
            {medication.dose} · {scheduleLabel(schedule, t)}
          </p>
        </div>
        <div className="health-actions">
          {medication.status !== "finished" && (
            <>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStateAction({
                    action: medication.status === "paused" ? "resume" : "pause",
                    requestId: crypto.randomUUID(),
                  });
                }}
              >
                {medication.status === "paused" ? (
                  <Play size={18} />
                ) : (
                  <Pause size={18} />
                )}
                {t(
                  medication.status === "paused"
                    ? "health.treatment_resume"
                    : "health.treatment_pause",
                )}
              </button>
              <button
                className="btn-secondary health-danger"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStateAction({
                    action: "finish",
                    requestId: crypto.randomUUID(),
                  });
                }}
              >
                <X size={18} />
                {t("health.treatment_finish")}
              </button>
            </>
          )}
          <button
            className="btn-primary"
            disabled={busy || !dueSlot}
            onClick={() => openDose(dueSlot)}
          >
            <Check size={18} />
            {t("health.treatment_record_dose")}
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              onForm?.({
                kind: "medications",
                record: { ...medication, schedule },
              })
            }
          >
            <Edit size={18} />
            {t("health.edit_treatment")}
          </button>
        </div>
      </header>
      {error && !recording && !stateAction && (
        <p role="alert" className="health-error">
          {t(`health.${error}`, { defaultValue: t("health.error") })}
        </p>
      )}
      <nav className="health-tabs" aria-label={t("health.summary")}>
        {[
          ["summary", Check],
          ["calendar", Calendar],
          ["history", History],
          ["documents", FileText],
        ].map(([key, Icon]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {React.createElement(Icon, { size: 16 })}
            {t(
              key === "documents"
                ? "health.documents"
                : `health.treatment_${key}`,
            )}
          </button>
        ))}
      </nav>
      {tab === "summary" && (
        <div className="health-treatment-columns">
          <div className="health-section">
            <section className="glass-card health-card">
              <h3>{t("health.treatment_summary")}</h3>
              <p>
                {t(
                  schedule?.duration_kind === "continuous"
                    ? "health.treatment_duration_continuous"
                    : "health.duration_days",
                  { count: schedule?.duration_days || 0 },
                )}
              </p>
              {total != null && (
                <>
                  <p>
                    {t("health.taken_of_planned", {
                      taken: stats?.taken_total || 0,
                      planned: total,
                    })}
                  </p>
                  <progress
                    aria-label={t("health.treatment_summary")}
                    value={stats?.taken_total || 0}
                    max={Math.max(total, 1)}
                  />
                </>
              )}
              <dl className="health-treatment-metrics">
                {[
                  ["treatment_taken", stats?.taken_total],
                  ["treatment_skipped", stats?.skipped_total],
                  ["treatment_overdue", stats?.overdue],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{t(`health.${key}`)}</dt>
                    <dd>{value || 0}</dd>
                  </div>
                ))}
              </dl>
              <p>
                {regularity == null
                  ? t("health.no_elapsed_doses")
                  : t("health.regularity_percent", { percent: regularity })}
              </p>
              <small className="health-muted">
                {t("health.regularity_window")}
              </small>
            </section>
            <section className="glass-card health-card">
              <h3>{t("health.last_seven_days")}</h3>
              {calendar.isLoading ? (
                <HealthLoading />
              ) : calendar.isError ? (
                <HealthError query={calendar} />
              ) : (
                <div className="health-treatment-week">
                  {Array.from({ length: 7 }, (_, index) =>
                    addDays(today, index - 6),
                  ).map((day) => {
                    const slots =
                      days.find((row) => row.date === day)?.slots || [];
                    const pending = slots.some((slot) =>
                      ["missed", "skipped"].includes(slot.status),
                    );
                    return (
                      <button
                        key={day}
                        className={
                          pending ? "health-day-pending" : "health-day-complete"
                        }
                        onClick={() => {
                          setSelectedDay(day);
                          setTab("calendar");
                          setMonthOffset(0);
                        }}
                        aria-label={localDateLabel(day)}
                      >
                        <span>
                          {new Intl.DateTimeFormat(i18n.language, {
                            weekday: "short",
                            timeZone: "UTC",
                          }).format(new Date(day + "T12:00:00Z"))}
                        </span>
                        <strong>{Number(day.slice(-2))}</strong>
                        <span>
                          {slots.length ? (pending ? "!" : "✓") : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="glass-card health-card">
              <h3>{t("health.treatment_information")}</h3>
              <p>{t("health.timezone_snapshot", { timezone })}</p>
              {schedule?.anchor_at && (
                <p>
                  {t("health.first_dose", { date: date(schedule.anchor_at) })}
                </p>
              )}
              {schedule?.last_slot && (
                <p>
                  {t("health.last_dose", { date: date(schedule.last_slot) })}
                </p>
              )}
              {medication.notes && (
                <p className="health-text">{medication.notes}</p>
              )}
              <button
                className="btn-secondary"
                onClick={() => setTab("documents")}
              >
                <FileText size={18} />
                {t("health.documents")}
              </button>
            </section>
          </div>
          <div className="health-section">
            <section>
              <h3>{t("health.today_doses")}</h3>
              {detail.data.today?.length ? (
                <ul className="health-list">
                  {detail.data.today.map(renderSlot)}
                </ul>
              ) : (
                <p>{t("health.treatment_no_slots")}</p>
              )}
            </section>
            <section className="glass-card health-card">
              <h3>{t("health.next_dose")}</h3>
              {detail.data.next?.[0] ? (
                <p>{date(detail.data.next[0].scheduled_at)}</p>
              ) : (
                <p>{t("health.treatment_no_slots")}</p>
              )}
            </section>
          </div>
        </div>
      )}
      {tab === "calendar" && (
        <div className="health-treatment-columns">
          <section className="glass-card health-card">
            <div className="health-row">
              <button
                className="btn-secondary"
                aria-label={t("health.previous_month")}
                onClick={() => {
                  setMonthOffset((value) => value - 1);
                  setSelectedDay(null);
                }}
              >
                ‹
              </button>
              <h3 className="health-grow">
                {new Intl.DateTimeFormat(i18n.language, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(month)}
              </h3>
              <button
                className="btn-secondary"
                aria-label={t("health.next_month")}
                onClick={() => {
                  setMonthOffset((value) => value + 1);
                  setSelectedDay(null);
                }}
              >
                ›
              </button>
            </div>
            {calendar.isLoading ? (
              <HealthLoading />
            ) : calendar.isError ? (
              <HealthError query={calendar} />
            ) : (
              <>
                <div className="health-treatment-calendar">
                  {Array.from({ length: 7 }, (_, index) => (
                    <span key={index} className="health-muted">
                      {new Intl.DateTimeFormat(i18n.language, {
                        weekday: "narrow",
                        timeZone: "UTC",
                      }).format(new Date(Date.UTC(2026, 10, index + 1)))}
                    </span>
                  ))}
                  {Array.from({ length: month.getUTCDay() }, (_, index) => (
                    <span key={`blank-${index}`} />
                  ))}
                  {Array.from({ length: Number(end.slice(-2)) }, (_, index) => {
                    const day =
                      start.slice(0, 8) + String(index + 1).padStart(2, "0");
                    const slots =
                      days.find((row) => row.date === day)?.slots || [];
                    const skipped = slots.some(
                      (slot) => slot.status === "skipped",
                    );
                    const pending = slots.some(
                      (slot) => slot.status === "missed",
                    );
                    const taken =
                      slots.length > 0 &&
                      slots.every((slot) => slot.status === "taken");
                    return (
                      <button
                        key={day}
                        aria-label={t("health.calendar_day_summary", {
                          date: localDateLabel(day),
                          planned: slots.length,
                          taken: slots.filter((slot) => slot.status === "taken")
                            .length,
                        })}
                        aria-pressed={day === (selectedDay || today)}
                        className={
                          skipped
                            ? "health-day-skipped"
                            : pending
                              ? "health-day-pending"
                              : taken
                                ? "health-day-complete"
                                : ""
                        }
                        onClick={() => setSelectedDay(day)}
                      >
                        <strong>{index + 1}</strong>
                        <span>
                          {skipped
                            ? "×"
                            : pending
                              ? "!"
                              : taken
                                ? "✓"
                                : slots.length
                                  ? "○"
                                  : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="health-muted">{t("health.calendar_legend")}</p>
              </>
            )}
          </section>
          <section>
            <h3>{localDateLabel(selectedDay || today)}</h3>
            {chosen?.slots?.length ? (
              <ul className="health-list">{chosen.slots.map(renderSlot)}</ul>
            ) : (
              <p>{t("health.treatment_no_slots")}</p>
            )}
          </section>
        </div>
      )}
      {tab === "history" && (
        <section className="health-section">
          <label className="health-field">
            <span>{t("health.status")}</span>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setCursors([null]);
              }}
            >
              {[
                "all",
                "taken",
                "skipped",
                "missed",
                "scheduled",
                "canceled",
              ].map((value) => (
                <option key={value} value={value}>
                  {t(
                    value === "all" ? "health.all" : `health.${STATUS[value]}`,
                  )}
                </option>
              ))}
            </select>
          </label>
          {history.isLoading ? (
            <HealthLoading />
          ) : history.isError ? (
            <HealthError query={history} />
          ) : history.data?.rows?.length ? (
            <ul className="health-list">{history.data.rows.map(renderSlot)}</ul>
          ) : (
            <HealthEmpty />
          )}
          <div className="health-actions">
            <button
              className="btn-secondary"
              disabled={cursors.length === 1 || history.isLoading}
              onClick={() => setCursors((values) => values.slice(0, -1))}
            >
              {t("health.previous")}
            </button>
            <span>{t("health.page", { page: cursors.length })}</span>
            <button
              className="btn-secondary"
              disabled={!history.data?.has_more || history.isLoading}
              onClick={() =>
                setCursors((values) => [...values, history.data.next_cursor_at])
              }
            >
              {t("health.next")}
            </button>
          </div>
        </section>
      )}
      {tab === "documents" && (
        <HealthDocuments
          userId={userId}
          parent={{ field: "medication_id", id: medicationId }}
        />
      )}
      {recording && (
        <HealthModal
          title={t("health.treatment_record_dose")}
          onClose={() => !busy && setRecording(null)}
        >
          <form className="health-form" onSubmit={submitDose}>
            <p>
              {medication.name} · {medication.dose}
            </p>
            <p>
              {t("health.scheduled_at")}:{" "}
              <strong>{date(recording.scheduledAt)}</strong>
            </p>
            <fieldset disabled={busy} className="health-form-grid">
              <label className="health-field">
                <span>{t("health.status")}</span>
                <select
                  value={recording.status}
                  onChange={(e) =>
                    setRecording({
                      ...recording,
                      status: e.target.value,
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  <option value="taken">{t("health.status_taken")}</option>
                  <option value="skipped">{t("health.status_skipped")}</option>
                </select>
              </label>
              {recording.status === "taken" && (
                <label className="health-field">
                  <span>{t("health.taken_at")}</span>
                  <input
                    type="datetime-local"
                    required
                    value={recording.takenLocal}
                    onChange={(e) =>
                      setRecording({
                        ...recording,
                        takenLocal: e.target.value,
                        requestId: crypto.randomUUID(),
                      })
                    }
                  />
                </label>
              )}
              <label className="health-field">
                <span>{t("health.amount")}</span>
                <input
                  maxLength={255}
                  value={recording.amount}
                  onChange={(e) =>
                    setRecording({
                      ...recording,
                      amount: e.target.value,
                      requestId: crypto.randomUUID(),
                    })
                  }
                />
              </label>
              <label className="health-field">
                <span>{t("health.dose_reason")}</span>
                <input
                  maxLength={1000}
                  value={recording.reason}
                  onChange={(e) =>
                    setRecording({
                      ...recording,
                      reason: e.target.value,
                      requestId: crypto.randomUUID(),
                    })
                  }
                />
              </label>
            </fieldset>
            {error && (
              <p role="alert" className="health-error">
                {t(`health.${error}`, { defaultValue: t("health.error") })}
              </p>
            )}
            <footer className="health-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setRecording(null)}
              >
                {t("health.cancel")}
              </button>
              <button className="btn-primary" disabled={busy}>
                {t("health.save")}
              </button>
            </footer>
          </form>
        </HealthModal>
      )}
      {stateAction && (
        <HealthModal
          title={t(`health.treatment_${stateAction.action}`)}
          onClose={() => !busy && setStateAction(null)}
        >
          <p>
            {t(
              stateAction.action === "resume"
                ? "health.resume_impact"
                : "health.finish_impact",
            )}
          </p>
          {error && (
            <p role="alert" className="health-error">
              {t(`health.${error}`, { defaultValue: t("health.error") })}
            </p>
          )}
          <div className="health-actions">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setStateAction(null)}
            >
              {t("health.cancel")}
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={changeState}
            >
              {t("health.confirm")}
            </button>
          </div>
        </HealthModal>
      )}
    </section>
  );
}
