import React, { useState } from "react";
import { Pill, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useTreatmentList,
  useTreatmentDashboard,
} from "../../hooks/useTreatments";
import { useHealthSearch } from "../../hooks/useHealth";
import { deviceTimeZone, scheduleLabel } from "../../lib/treatmentEngine";
import {
  HealthDate,
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthPagination,
  HealthStatus,
} from "./HealthUI";

export default function TreatmentList({ userId, navigate, group = "active" }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusGroup, setStatusGroup] = useState(group);
  const [page, setPage] = useState(0);
  const prefix = useHealthSearch(search);
  const query = useTreatmentList(userId, { group: statusGroup, prefix, page });
  const dashboard = useTreatmentDashboard(userId, deviceTimeZone() || "UTC");
  const stats = dashboard.data;
  const rows = query.data?.rows || [];
  return (
    <section className="health-section">
      <div
        className="health-actions"
        role="group"
        aria-label={t("health.status")}
      >
        {["active", "finished", "all"].map((value) => (
          <button
            key={value}
            aria-pressed={statusGroup === value}
            className={statusGroup === value ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setStatusGroup(value);
              setPage(0);
            }}
          >
            {t(
              value === "all"
                ? "health.all"
                : `health.treatment_status_${value}`,
            )}
          </button>
        ))}
      </div>
      {dashboard.isError ? (
        <HealthError query={dashboard} />
      ) : (
        <dl className="health-treatment-stats">
          <div className="glass-card health-card">
            <dt>{t("health.active_treatments")}</dt>
            <dd>{stats?.active_count ?? "—"}</dd>
            <small>
              {t("health.continuous_count", {
                count: stats?.continuous_count || 0,
              })}
            </small>
          </div>
          <div className="glass-card health-card">
            <dt>{t("health.today_doses")}</dt>
            <dd>
              {t("health.taken_of_planned", {
                taken: stats?.today?.taken ?? 0,
                planned: stats?.today?.planned ?? 0,
              })}
            </dd>
            <small>
              {t("health.overdue_count", { count: stats?.today?.overdue || 0 })}
            </small>
          </div>
          <div className="glass-card health-card">
            <dt>{t("health.next_dose")}</dt>
            <dd>
              <HealthDate value={stats?.next?.scheduled_at} />
            </dd>
            <small>{stats?.next?.name || t("health.treatment_no_slots")}</small>
          </div>
        </dl>
      )}
      <label className="health-search-wrap">
        <Search size={18} />
        <input
          aria-label={t("health.search")}
          placeholder={t("health.search")}
          maxLength={120}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {query.isLoading ? (
        <HealthLoading />
      ) : query.isError ? (
        <HealthError query={query} />
      ) : !rows.length ? (
        <HealthEmpty />
      ) : (
        <div className="health-list">
          {rows.map((record) => (
            <article
              className="glass-card health-card health-treatment-row"
              key={record.id}
            >
              <div className="health-grow">
                <div className="health-row">
                  <Pill size={24} />
                  <button
                    className="health-treatment-link"
                    onClick={() => navigate(`health/medications/${record.id}`)}
                  >
                    {record.name}
                  </button>
                  <HealthStatus status={record.status} />
                </div>
                <p className="health-muted">
                  {record.dose} · {scheduleLabel(record.schedule, t)}
                </p>
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
                  </>
                ) : (
                  <p>{t("health.treatment_duration_continuous")}</p>
                )}
                <p>
                  {t("health.today_doses")}:{" "}
                  {t("health.taken_of_planned", {
                    taken: record.today?.taken || 0,
                    planned: record.today?.planned || 0,
                  })}
                </p>
              </div>
              <div>
                <span className="health-muted">{t("health.next_dose")}</span>
                <p>
                  <HealthDate value={record.next_at} />
                </p>
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`health/medications/${record.id}`)}
                >
                  {t("health.view_treatment")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <HealthPagination
        page={page}
        hasNext={Boolean(query.data?.has_more)}
        onPage={setPage}
      />
    </section>
  );
}
