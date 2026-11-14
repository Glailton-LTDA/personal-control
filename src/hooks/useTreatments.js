import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  saveTreatment,
  treatmentState,
  recordDose,
  undoDose,
  listTreatments,
  treatmentDashboard,
  treatmentDetail,
  treatmentCalendar,
  treatmentHistory,
  refreshReminders,
  TREATMENT_PAGE_SIZE,
} from "../lib/treatments";

async function checked(promise) {
  const result = await promise;
  if (result?.error) throw new Error(result.error);
  return result?.data;
}

// Query keys always include the user so cache never leaks across accounts and
// is cleared on session change.
export const treatmentKeys = {
  all: (userId) => ["treatments", userId],
  list: (userId, params) => [...treatmentKeys.all(userId), "list", params],
  detail: (userId, medicationId) => [
    ...treatmentKeys.all(userId),
    "detail",
    medicationId,
  ],
  dashboard: (userId, timezone) => [
    ...treatmentKeys.all(userId),
    "dashboard",
    timezone,
  ],
  calendar: (userId, medicationId, from, to) => [
    ...treatmentKeys.all(userId),
    "calendar",
    medicationId,
    from,
    to,
  ],
  history: (userId, medicationId, params) => [
    ...treatmentKeys.all(userId),
    "history",
    medicationId,
    params,
  ],
};

export function useTreatmentList(userId, params = {}, enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.list(userId, params),
    queryFn: () => checked(listTreatments(userId, params)),
    enabled: Boolean(userId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentDashboard(
  userId,
  timezone = "UTC",
  enabled = true,
) {
  return useQuery({
    queryKey: treatmentKeys.dashboard(userId, timezone),
    queryFn: () => checked(treatmentDashboard(userId, timezone)),
    enabled: Boolean(userId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentDetail(userId, medicationId, enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.detail(userId, medicationId),
    queryFn: () => checked(treatmentDetail(userId, medicationId)),
    enabled: Boolean(userId && medicationId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentCalendar(
  userId,
  medicationId,
  from,
  to,
  enabled = true,
) {
  return useQuery({
    queryKey: treatmentKeys.calendar(userId, medicationId, from, to),
    queryFn: () => checked(treatmentCalendar(userId, medicationId, from, to)),
    enabled: Boolean(userId && medicationId && from && to) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentHistory(
  userId,
  medicationId,
  params = {},
  enabled = true,
) {
  return useQuery({
    queryKey: treatmentKeys.history(userId, medicationId, params),
    queryFn: () => checked(treatmentHistory(userId, medicationId, params)),
    enabled: Boolean(userId && medicationId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

// A command ID is allocated before mutate starts, so automatic retries and a
// caller retry with the same requestId reuse exactly the same server command.
function useTreatmentMutation(userId, write) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (command) => checked(write(command)),
    onMutate: () => client.cancelQueries({ queryKey: treatmentKeys.all(userId) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["health", userId] });
      client.invalidateQueries({ queryKey: treatmentKeys.all(userId) });
    },
    retry: (count, error) =>
      count < 1 &&
      !error?.message?.match(
        /conflict|invalid|forbidden|expired|future|scheduled/,
      ),
  });
  const command = (values = {}) => ({
    ...values,
    requestId: values.requestId || crypto.randomUUID(),
  });
  return {
    ...mutation,
    mutate: (values, options) => mutation.mutate(command(values), options),
    mutateAsync: (values, options) =>
      mutation.mutateAsync(command(values), options),
  };
}

export function useTreatmentRefresh(userId) {
  return useTreatmentMutation(userId, () => refreshReminders(userId));
}

export function useSaveTreatment(userId) {
  return useTreatmentMutation(userId, ({ requestId, ...values }) =>
    saveTreatment(userId, values, requestId),
  );
}

export function useTreatmentState(userId) {
  return useTreatmentMutation(
    userId,
    ({ medicationId, action, options, requestId }) =>
      treatmentState(userId, medicationId, action, {
        ...options,
        p_request_id: requestId,
      }),
  );
}

export function useRecordDose(userId) {
  return useTreatmentMutation(
    userId,
    ({ medicationId, scheduledAt, status, options, requestId }) =>
      recordDose(userId, medicationId, scheduledAt, status, {
        ...options,
        p_request_id: requestId,
      }),
  );
}

export function useUndoDose(userId) {
  return useTreatmentMutation(
    userId,
    ({ medicationId, scheduledAt, expectedVersion, requestId }) =>
      undoDose(userId, medicationId, scheduledAt, expectedVersion, requestId),
  );
}

export { TREATMENT_PAGE_SIZE };
