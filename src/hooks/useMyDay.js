import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dayISO, loadMyDay, MY_DAY_MODULES, myDayKey } from '../lib/myDay';

// Mounted once in the authenticated shell. Writes elsewhere mark only this
// preview stale; they never fetch an inactive screen in the background.
export function useMyDayInvalidation(userId) {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    return client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action?.type === 'success' && !event.mutation?.options?.meta?.refreshesMyDay)
        client.invalidateQueries({
          queryKey: myDayKey(userId),
          refetchType: 'none',
        });
    });
  }, [client, userId]);
}
export function useMyDay(userId, visibleModules = MY_DAY_MODULES) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const modules = MY_DAY_MODULES.filter((module) =>
    visibleModules.includes(module)
  );
  const query = useQuery({
    queryKey: [...myDayKey(userId), dayISO(now), timezone, modules.join(',')],
    queryFn: ({ signal }) => loadMyDay(userId, timezone, modules, signal),
    enabled: Boolean(userId) && modules.length > 0,
    staleTime: 300000,
    gcTime: 600000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
  });
  return { ...query, now, timezone, hasModules: modules.length > 0 };
}
