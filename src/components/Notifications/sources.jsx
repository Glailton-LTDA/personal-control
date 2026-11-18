import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { listHealth, dismissHealth } from "../../lib/health";
import { useHealthReminderSync } from "../../hooks/useHealth";
import { loadFinanceNotifications } from "../../lib/notifications/finance";
import { writeMonthKey } from "../MinhasFinancas/mfViewState";

function usePublishFeed(id, feed, publish) {
  // Components call this custom hook in a fixed order; modules are registered
  // as components, never by conditionally calling hooks in the toolbar.
  useEffect(() => {
    publish(id, feed);
  }, [id, feed, publish]);
}

export function HealthNotificationSource({
  user,
  navigate,
  publish,
  client,
  now,
}) {
  const uid = user.id;
  const sync = useHealthReminderSync(uid);
  const query = useInfiniteQuery({
    queryKey: ["health", uid, "notification-feed"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listHealth(uid, "reminders", { page: pageParam, withCount: true }),
    getNextPageParam: (last, pages) =>
      last.hasNext ? pages.length : undefined,
    enabled: sync.isSuccess,
    staleTime: 30000,
    gcTime: 0,
    refetchInterval: 60000,
    retry: 1,
  });
  const dismiss = useMutation({
    mutationFn: (id) => dismissHealth(uid, id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["health", uid] }),
  });
  const { fetchNextPage, refetch } = query;
  const { refetch: syncRefresh } = sync;
  const { mutateAsync: dismissReminder } = dismiss;
  const feed = useMemo(() => {
    const rows = query.data?.pages.flatMap((page) => page.rows) || [];
    return {
      items: rows.map((row) => {
        const kind = row.medication_id
          ? "medications"
          : row.appointment_id
            ? "appointments"
            : "exams";
        const id = row.medication_id || row.appointment_id || row.exam_id;
        return {
          id: `health:${row.id}`,
          title:
            row.medication?.name || row.appointment?.name || row.exam?.name,
          titleKey: `health.${kind}`,
          at: row.remind_at,
          statusKey: row.delivered_at
            ? "health.notification_sent"
            : new Date(row.remind_at).getTime() <= now
              ? "health.notification_due"
              : "health.notification_scheduled",
          onOpen: () => navigate(`health/${kind}/${id}`),
          onDismiss: () => dismissReminder(row.id),
        };
      }),
      count: query.data?.pages[0]?.total ?? rows.length,
      lowerBound: query.data?.pages[0]?.total == null && !!query.hasNextPage,
      loading: sync.isLoading || query.isLoading,
      error: sync.isError || query.isError,
      hasMore: query.hasNextPage,
      loadMore: () => fetchNextPage(),
      fetching: query.isFetchingNextPage,
      refresh: () => {
        syncRefresh();
        refetch();
      },
    };
  }, [
    now,
    query.data,
    query.isLoading,
    query.isError,
    query.hasNextPage,
    query.isFetchingNextPage,
    fetchNextPage,
    refetch,
    sync.isLoading,
    sync.isError,
    syncRefresh,
    navigate,
    dismissReminder,
  ]);
  usePublishFeed("health", feed, publish);
  return null;
}

export function FinanceNotificationSource({ user, navigate, publish, today }) {
  const query = useQuery({
    queryKey: ["mf-global-notifications", user.id, today],
    queryFn: () => loadFinanceNotifications(user.id, today),
    staleTime: 60000,
    gcTime: 0,
    refetchInterval: 60000,
    retry: 1,
  });
  const feed = useMemo(
    () => ({
      items: (query.data?.reminders || []).map((row) => ({
        id: `minhasfinancas:${row.key}`,
        title: row.kind === "invoice_closed" ? undefined : row.description,
        titleKey: "minhasfinancas.rem_invoice_title",
        titleParams: { card: row.cardName },
        at: `${row.dueISO || row.closeISO}T12:00:00`,
        dateOnly: true,
        amount: {
          value: row.kind === "invoice_closed" ? row.total : row.amount,
          currency: row.currency,
        },
        statusKey: `minhasfinancas.${{ overdue: "rem_overdue", today: "rem_today", upcoming: "rem_upcoming", invoice_closed: "rem_invoice_closed" }[row.kind]}`,
        onOpen: () => {
          if (row.dueISO) writeMonthKey(row.dueISO.slice(0, 7));
          navigate(
            row.kind === "invoice_closed"
              ? "minhasfinancas/cards"
              : "minhasfinancas/transactions",
          );
        },
      })),
      count: query.data?.reminders.length || 0,
      lowerBound: !!query.data?.hasMore,
      loading: query.isLoading,
      error: query.isError,
      refresh: query.refetch,
      moreInModule: !!query.data?.hasMore,
    }),
    [query.data, query.isLoading, query.isError, query.refetch, navigate],
  );
  usePublishFeed("minhasfinancas", feed, publish);
  return null;
}
