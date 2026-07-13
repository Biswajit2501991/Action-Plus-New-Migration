"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { readAuthToken } from "@/lib/auth-storage";
import { authCookieModeEnabled } from "@/lib/auth-cookie-mode";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

/** Subscribe to backend SSE and invalidate React Query caches by collection. */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = readAuthToken();
    if (!token && !authCookieModeEnabled()) return;

    const url = token
      ? `${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`
      : `${API_BASE}/realtime/stream`;

    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        const es = new EventSource(url, { withCredentials: authCookieModeEnabled() });
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as { collection?: string };
            const c = String(data.collection || "");
            if (!c) return;
            if (c.includes("member")) qc.invalidateQueries({ queryKey: ["members"] });
            if (c.includes("visitor")) qc.invalidateQueries({ queryKey: ["visitors"] });
            if (c.includes("user") || c.includes("staff")) qc.invalidateQueries({ queryKey: ["users"] });
            if (c.includes("setting")) qc.invalidateQueries({ queryKey: ["settings"] });
            if (c.includes("finance")) qc.invalidateQueries({ queryKey: ["finance"] });
            if (c.includes("log")) qc.invalidateQueries({ queryKey: ["logs"] });
            if (c.includes("attendance")) qc.invalidateQueries({ queryKey: ["attendance"] });
            if (c.includes("sms")) qc.invalidateQueries({ queryKey: ["sms-events"] });
          } catch {
            // ignore malformed frames
          }
        };
        es.onerror = () => {
          es.close();
          esRef.current = null;
          if (!closed) retryTimer = setTimeout(connect, 4000);
        };
      } catch {
        if (!closed) retryTimer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, qc]);
}
