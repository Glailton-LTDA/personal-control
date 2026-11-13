import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '../lib/treatments';

// Query keys always include the user so cache never leaks across accounts and
// is cleared on session change.
export const treatmentKeys = {
  all: (userId) => ['treatments', userId],
  list: (userId, params) => [...treatmentKeys.all(userId), 'list', params],
  detail: (userId, medicationId) => [...treatmentKeys.all(userId), 'detail', medicationId],
  dashboard: (userId, timezone) => [...treatmentKeys.all(userId), 'dashboard', timezone],
  calendar: (userId, medicationId, from, to) => [
    ...treatmentKeys.all(userId),
    'calendar',
    medicationId,
    from,
    to,
  ],
  history: (userId, medicationId, params) => [
    ...treatmentKeys.all(userId),
    'history',
    medicationId,
    params,
  ],
};

export function useTreatmentList(userId, params = {}, enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.list(userId, params),
    queryFn: () => listTreatments(userId, params),
    enabled: Boolean(userId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentDashboard(userId, timezone = 'UTC', enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.dashboard(userId, timezone),
    queryFn: () => treatmentDashboard(userId, timezone),
    enabled: Boolean(userId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentDetail(userId, medicationId, enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.detail(userId, medicationId),
    queryFn: () => treatmentDetail(userId, medicationId),
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
    queryFn: () => treatmentCalendar(userId, medicationId, from, to),
    enabled: Boolean(userId && medicationId && from && to) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentHistory(userId, medicationId, params = {}, enabled = true) {
  return useQuery({
    queryKey: treatmentKeys.history(userId, medicationId, params),
    queryFn: () => treatmentHistory(userId, medicationId, params),
    enabled: Boolean(userId && medicationId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}

export function useTreatmentRefresh(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => refreshReminders(userId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['health', userId] });
      client.invalidateQueries({ queryKey: ['treatments', userId] });
    },
  });
}

export function useSaveTreatment(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values) => saveTreatment(userId, values),
    onMutate: () => {
      client.cancelQueries({ queryKey: ['treatments', userId] });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['health', userId] });
      client.invalidateQueries({ queryKey: ['treatments', userId] });
    },
    retry: 1,
  });
}

export function useTreatmentState(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ medicationId, action, options }) =>
      treatmentState(userId, medicationId, action, options),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['health', userId] });
      client.invalidateQueries({ queryKey: ['treatments', userId] });
    },
    retry: 1,
  });
}

export function useRecordDose(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      scheduledAt,
      status,
      options,
    }) => recordDose(userId, medicationId, scheduledAt, status, options),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['health', userId] });
      client.invalidateQueries({ queryKey: ['treatments', userId] });
    },
    retry: 1,
  });
}

export function useUndoDose(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ medicationId, scheduledAt, expectedVersion }) =>
      undoDose(userId, medicationId, scheduledAt, expectedVersion),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['health', userId] });
      client.invalidateQueries({ queryKey: ['treatments', userId] });
    },
    retry: 1,
  });
}

export { TREATMENT_PAGE_SIZE };
