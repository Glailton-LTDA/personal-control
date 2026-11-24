import React, { useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useTreatmentList,
  useTreatmentDashboard,
} from "../../hooks/useTreatments";
import { useHealthSearch } from "../../hooks/useHealth";
import { deviceTimeZone } from "../../lib/treatmentEngine";
import {
  HealthDate,
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthPagination,
} from "./HealthUI";

import TreatmentCard from "./TreatmentCard";

export default function TreatmentList({
  userId,
  navigate,
  onForm,
  group = "active",
  overview = true,
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusGroup, setStatusGroup] = useState(group);
  const [page, setPage] = useState(0);
  const prefix = useHealthSearch(search);
  const query = useTreatmentList(userId, { group: statusGroup, prefix, page });
  const dashboard = useTreatmentDashboard(
    userId,
    deviceTimeZone() || "UTC",
    overview,
  );
  const stats = dashboard.data;
  const rows = query.data?.rows || [];
  return (
    <section className="health-section">
      {overview && (
        <div
          className="health-actions"
          role="group"
          aria-label={t("health.status")}
        >
          {["active", "finished", "all"].map((value) => (
            <button
              key={value}
              aria-pressed={statusGroup === value}
              className={
                statusGroup === value ? "btn-primary" : "btn-secondary"
              }
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
      )}
      {overview &&
        (dashboard.isError ? (
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
                {t("health.overdue_count", {
                  count: stats?.today?.overdue || 0,
                })}
              </small>
            </div>
            <div className="glass-card health-card">
              <dt>{t("health.next_dose")}</dt>
              <dd>
                <HealthDate value={stats?.next?.scheduled_at} />
              </dd>
              <small>
                {stats?.next?.name || t("health.treatment_no_slots")}
              </small>
            </div>
          </dl>
        ))}
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
            <TreatmentCard
              key={record.id}
              record={record}
              userId={userId}
              navigate={navigate}
              onForm={onForm}
            />
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
