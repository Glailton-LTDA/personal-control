import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHealth, listHealth, refreshHealthReminders } from '../lib/health';

export function useHealthReminderSync(userId) {
  return useQuery({
    queryKey: ['health', userId, 'reminder-sync'],
    queryFn: () => refreshHealthReminders(userId),
    enabled: Boolean(userId),
    gcTime: 0,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
}

export function useHealthList(userId, kind, options = {}, enabled = true) {
  return useQuery({
    queryKey: ['health', userId, kind, 'list', options],
    queryFn: () => listHealth(userId, kind, options),
    enabled: Boolean(userId) && enabled,
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
    refetchInterval: kind === 'reminders' ? 60000 : false,
  });
}
export function useHealthDetail(userId, kind, id) {
  return useQuery({
    queryKey: ['health', userId, kind, 'detail', id],
    queryFn: () => getHealth(userId, kind, id),
    enabled: Boolean(userId && id),
    staleTime: 30000,
    gcTime: 0,
    retry: 1,
  });
}
export function useHealthSearch(value) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return search;
}
