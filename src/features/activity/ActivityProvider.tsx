import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import type { ActivityEvent, ActivitySnapshot } from '../../domain/models';
import { useRuntime } from '../../shared/runtime';
import { ApiError, errorMessage } from '../../shared/errors';
import { loadActivity, markRead, ReadError } from './service';

const activityKey = ['activity'] as const;

function useActivityController() {
  const { gateway } = useRuntime();
  const client = useQueryClient();
  const [mutationError, setMutationError] = useState('');
  const [reading, setReading] = useState(false);
  const [announcement, setAnnouncement] = useState<ActivityEvent | null>(null);
  const location = useLocation();
  const seen = useRef<Set<number> | null>(null);
  const readAbort = useRef(new AbortController());
  useEffect(() => {
    const abort = new AbortController();
    readAbort.current = abort;
    return () => abort.abort();
  }, []);
  const query = useQuery({
    queryKey: activityKey,
    queryFn: ({ signal }) => loadActivity(gateway, signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: !reading,
  });

  const mutation = useMutation({
    mutationKey: ['activity-read'],
    mutationFn: (ids: number[]) => markRead(gateway, ids, readAbort.current.signal),
    onMutate: async (ids) => {
      setReading(true);
      setMutationError('');
      await client.cancelQueries({ queryKey: activityKey });
      const previous = client.getQueryData<ActivitySnapshot>(activityKey);
      client.setQueryData<ActivitySnapshot>(activityKey, (value) =>
        value
          ? {
              ...value,
              items: value.items.map((item) =>
                ids.includes(item.id) ? { ...item, isRead: true } : item,
              ),
            }
          : value,
      );
      return { previous };
    },
    onError: (error, ids, context) => {
      if (readAbort.current.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) return;
      const failed = error instanceof ReadError ? error.failedIds : ids;
      client.setQueryData<ActivitySnapshot>(activityKey, (value) =>
        value
          ? {
              ...value,
              items: value.items.map((item) => {
                const previous = context?.previous?.items.find((old) => old.id === item.id);
                return failed.includes(item.id) && previous
                  ? { ...item, isRead: previous.isRead }
                  : item;
              }),
            }
          : value,
      );
      setMutationError(errorMessage(error));
    },
    onSettled: () => {
      if (readAbort.current.signal.aborted) return;
      setReading(false);
      void client.invalidateQueries({ queryKey: activityKey });
    },
  });

  useEffect(() => {
    const items = query.data?.items;
    if (!items) return;
    if (seen.current !== null) {
      const fresh = items.find((item) => !item.isRead && !seen.current!.has(item.id));
      if (fresh && location.pathname !== '/activity') setAnnouncement(fresh);
    }
    seen.current = new Set([...(seen.current ?? []), ...items.map((item) => item.id)]);
  }, [query.data, location.pathname]);

  useEffect(() => {
    if (location.pathname === '/activity') setAnnouncement(null);
  }, [location.pathname]);

  const readLock = useRef(false);
  async function read(ids: number[]) {
    if (readLock.current || !ids.length) return;
    readLock.current = true;
    try {
      await mutation.mutateAsync(ids);
    } catch {
      /* Mutation callbacks show the error and restore affected entries. */
    } finally {
      readLock.current = false;
    }
  }

  return {
    query,
    read,
    isReading: mutation.isPending,
    mutationError,
    announcement,
    dismissAnnouncement: () => setAnnouncement(null),
  };
}

const ActivityContext = createContext<ReturnType<typeof useActivityController> | null>(null);

/** Always mounted for an authenticated session; route changes never stop polling. */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const value = useActivityController();
  return <ActivityContext value={value}>{children}</ActivityContext>;
}

export function useActivity() {
  const value = useContext(ActivityContext);
  if (!value) throw new Error('Activity provider is missing');
  return value;
}
