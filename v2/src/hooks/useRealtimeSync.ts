import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { readAuthToken } from '@/lib/auth-storage';
import { visitorsQueryKey } from '@/hooks/useVisitors';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

/**
 * Subscribes to legacy Express SSE and invalidates TanStack Query caches.
 */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const token = readAuthToken();
    if (!token) return;

    const url = `${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { collection?: string };
        if (msg.collection === 'visitors') {
          qc.invalidateQueries({ queryKey: visitorsQueryKey });
        }
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [enabled, qc]);
}
