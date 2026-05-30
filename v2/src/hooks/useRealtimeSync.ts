import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hasBackendAuthSession } from '@/lib/auth-storage';
import { authCookieModeFromWindow } from '@/lib/auth-cookie-mode';
import { visitorsQueryKey } from '@/hooks/useVisitors';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

/**
 * Subscribes to legacy Express SSE and invalidates TanStack Query caches.
 */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    if (!hasBackendAuthSession()) return;

    const cookieMode = authCookieModeFromWindow();
    const url = cookieMode
      ? `${API_BASE}/realtime/stream`
      : `${API_BASE}/realtime/stream?token=${encodeURIComponent(
          (() => {
            try {
              const raw = localStorage.getItem('apg.auth.session');
              const parsed = raw ? JSON.parse(raw) : null;
              return parsed?.token || '';
            } catch {
              return '';
            }
          })(),
        )}`;
    const es = new EventSource(url, cookieMode ? { withCredentials: true } : undefined);

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
