import React, { useCallback, useEffect, useId, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import AppModal from "../AppModal";
import { notificationSources } from "./registry";
import "./NotificationCenter.css";

export default function NotificationCenter({
  user,
  navigate,
  showValues = true,
  modules,
  sources = notificationSources,
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const countId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [feeds, setFeeds] = useState({});
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const publish = useCallback(
    (id, feed) =>
      setFeeds((previous) =>
        previous[id] === feed ? previous : { ...previous, [id]: feed },
      ),
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const enabled = sources.filter(
    (source) => !modules || modules.includes(source.id),
  );
  const loading = enabled.some(
    (source) => !feeds[source.id] || feeds[source.id].loading,
  );
  const total = enabled.reduce(
    (sum, source) =>
      sum + (feeds[source.id]?.error ? 0 : feeds[source.id]?.count || 0),
    0,
  );
  const partial = enabled.some(
    (source) => feeds[source.id]?.lowerBound || feeds[source.id]?.error,
  );
  const selected =
    filter === "all" || enabled.some((source) => source.id === filter)
      ? filter
      : "all";
  const visible = enabled.filter(
    (source) => selected === "all" || source.id === selected,
  );
  const close = () => {
    setOpen(false);
    setActionError(false);
  };
  const dismiss = async (item) => {
    if (busy) return;
    setBusy(item.id);
    setActionError(false);
    try {
      await item.onDismiss();
    } catch {
      setActionError(true);
    } finally {
      setBusy(null);
    }
  };
  const badge = total > 99 ? "99+" : `${total}${partial ? "+" : ""}`;
  if (!user?.id) return null;
  return (
    <>
      {enabled.map(({ id, Source }) =>
        React.createElement(Source, {
          key: id,
          user,
          client,
          navigate,
          publish,
          today,
          now: now.getTime(),
        }),
      )}
      <button
        type="button"
        className="icon-btn notification-center-trigger"
        data-testid="global-notifications-bell"
        aria-label={t("notifications.title")}
        title={t("notifications.title")}
        aria-describedby={!loading && total > 0 ? countId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          setActionError(false);
        }}
      >
        <Bell size={20} />
        {!loading && total > 0 && (
          <span
            className="notification-center-count"
            id={countId}
            aria-live="polite"
            aria-label={t(
              partial ? "notifications.count_more" : "notifications.count",
              { count: total },
            )}
          >
            {badge}
          </span>
        )}
      </button>
      {open && (
        <AppModal
          title={t("notifications.title")}
          aria-describedby={!loading && total > 0 ? countId : undefined}
          closeLabel={t("notifications.close")}
          onClose={close}
          className="notification-center-panel"
        >
          <p className="notification-center-hint">{t("notifications.hint")}</p>
          <div
            className="notification-center-filters"
            role="group"
            aria-label={t("notifications.filter")}
          >
            {[{ id: "all", labelKey: "notifications.all" }, ...enabled].map(
              (source) => (
                <button
                  type="button"
                  key={source.id}
                  className="btn-secondary"
                  aria-pressed={selected === source.id}
                  onClick={() => {
                    setFilter(source.id);
                    setActionError(false);
                  }}
                >
                  {t(source.labelKey)}
                </button>
              ),
            )}
          </div>
          {actionError && (
            <p role="alert" className="notification-center-error">
              {t("notifications.action_error")}
            </p>
          )}
          {!enabled.length && <p>{t("notifications.empty")}</p>}
          {visible.map((source) => {
            const feed = feeds[source.id];
            return (
              <section
                className="notification-center-source"
                key={source.id}
                aria-label={t(source.labelKey)}
              >
                <header>
                  <h3>{t(source.labelKey)}</h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => feed?.refresh()}
                    disabled={!feed || feed.loading}
                  >
                    {t("notifications.refresh")}
                  </button>
                </header>
                {!feed || feed.loading ? (
                  <p role="status">
                    <Loader2 size={18} /> {t("notifications.loading")}
                  </p>
                ) : feed.error ? (
                  <div role="alert">
                    <p>{t("notifications.source_error")}</p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={feed.refresh}
                    >
                      {t("notifications.retry")}
                    </button>
                  </div>
                ) : (
                  <>
                    {!feed.items.length && <p>{t("notifications.empty")}</p>}
                    <ul>
                      {feed.items.map((item) => (
                        <li
                          key={item.id}
                          data-testid={`notification-${item.id}`}
                        >
                          <strong>
                            {item.title || t(item.titleKey, item.titleParams)}
                          </strong>
                          <span className="notification-center-status">
                            {t(item.statusKey)}
                          </span>
                          <time dateTime={item.at}>
                            {new Intl.DateTimeFormat(i18n.language, {
                              dateStyle: "medium",
                              ...(item.dateOnly ? {} : { timeStyle: "short" }),
                            }).format(new Date(item.at))}
                          </time>
                          {item.amount && (
                            <b className="notification-center-amount">
                              {showValues
                                ? new Intl.NumberFormat(i18n.language, {
                                    style: "currency",
                                    currency: item.amount.currency || "BRL",
                                  }).format(item.amount.value)
                                : "•••"}
                            </b>
                          )}
                          <div className="notification-center-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                close();
                                item.onOpen();
                              }}
                            >
                              {t("notifications.open")}
                            </button>
                            {item.onDismiss && (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={!!busy}
                                onClick={() => dismiss(item)}
                              >
                                {t("notifications.dismiss")}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {feed.hasMore && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={feed.fetching}
                        onClick={feed.loadMore}
                      >
                        {t("notifications.load_more")}
                      </button>
                    )}
                    {feed.moreInModule && (
                      <p className="notification-center-hint">
                        {t("notifications.more_in_module")}
                      </p>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </AppModal>
      )}
    </>
  );
}
