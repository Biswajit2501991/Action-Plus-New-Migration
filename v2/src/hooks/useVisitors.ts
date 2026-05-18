import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVisitors, saveVisitorsBulk } from '@/api/visitors';
import { dedupeVisitors } from '@/lib/visitors-dedupe';
import { localCalendarDateKey, localTodayCalendarKey } from '@/lib/dates';
import type { Visitor } from '@/features/visitors/visitors.types';
import { useAuth } from '@/hooks/useAuth';

export const visitorsQueryKey = ['visitors'] as const;

export function useVisitors() {
  const { session } = useAuth();
  return useQuery({
    queryKey: visitorsQueryKey,
    queryFn: async () => dedupeVisitors(await fetchVisitors()),
    enabled: Boolean(session?.token),
  });
}

export function useSaveVisitorsBulk() {
  const qc = useQueryClient();
  return useMutation<void, Error, Visitor[]>({
    mutationFn: (list) => saveVisitorsBulk(dedupeVisitors(list)),
    onMutate: async (nextVisitors) => {
      await qc.cancelQueries({ queryKey: visitorsQueryKey });
      const previous = qc.getQueryData<Visitor[]>(visitorsQueryKey);
      qc.setQueryData(visitorsQueryKey, nextVisitors);
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      const previous = (ctx as { previous?: Visitor[] } | undefined)?.previous;
      if (previous) qc.setQueryData(visitorsQueryKey, previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: visitorsQueryKey }),
  });
}

export function useMarkVisitorCalled() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (visitorId: string) => {
      const list = qc.getQueryData<Visitor[]>(visitorsQueryKey) || [];
      const target = list.find((v) => v.id === visitorId);
      if (!target) throw new Error('Visitor not found');
      const todayKey = localTodayCalendarKey();
      if (localCalendarDateKey(target.lastCalledAt) === todayKey) {
        throw new Error('Already marked as called today.');
      }
      const nowIso = new Date().toISOString();
      const actor = user?.name || user?.id || '';
      const next = list.map((v) =>
        v.id === visitorId ? { ...v, lastCalledAt: nowIso, lastCalledBy: actor } : v,
      );
      await saveVisitorsBulk(dedupeVisitors(next));
      return next;
    },
    onMutate: async (visitorId) => {
      await qc.cancelQueries({ queryKey: visitorsQueryKey });
      const previous = qc.getQueryData<Visitor[]>(visitorsQueryKey);
      const todayKey = localTodayCalendarKey();
      const target = previous?.find((v) => v.id === visitorId);
      if (target && localCalendarDateKey(target.lastCalledAt) !== todayKey) {
        const nowIso = new Date().toISOString();
        const actor = user?.name || user?.id || '';
        qc.setQueryData<Visitor[]>(
          visitorsQueryKey,
          (prev = []) =>
            prev.map((v) =>
              v.id === visitorId ? { ...v, lastCalledAt: nowIso, lastCalledBy: actor } : v,
            ),
        );
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(visitorsQueryKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: visitorsQueryKey }),
  });
}
