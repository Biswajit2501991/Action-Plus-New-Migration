"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readAuthToken } from "@/lib/auth-storage";
import { authCookieModeEnabled } from "@/lib/auth-cookie-mode";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

let realtimeConnected = false;
const connectionListeners = new Set<() => void>();

function setRealtimeConnected(next: boolean) {
  if (realtimeConnected === next) return;
  realtimeConnected = next;
  connectionListeners.forEach((listener) => listener());
}

/** True while the SSE stream is open (owner leave alerts rely on this + poll fallback). */
export function useRealtimeConnected() {
  return useSyncExternalStore(
    (onStoreChange) => {
      connectionListeners.add(onStoreChange);
      return () => connectionListeners.delete(onStoreChange);
    },
    () => realtimeConnected,
    () => false,
  );
}

function invalidateForCollection(qc: ReturnType<typeof useQueryClient>, collection: string) {
  const c = String(collection || "").toLowerCase();
  if (!c || c === "connected" || c === "ping" || c === "heartbeat") return;

  if (c.includes("member")) qc.invalidateQueries({ queryKey: ["members"] });
  if (c.includes("visitor")) qc.invalidateQueries({ queryKey: ["visitors"] });
  if (c.includes("user") || c.includes("staff")) qc.invalidateQueries({ queryKey: ["users"] });
  if (c.includes("setting") || c === "leave" || c.includes("leave")) {
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  if (c.includes("finance") || c.includes("payment")) {
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["finance-year"] });
  }
  if (c.includes("log")) qc.invalidateQueries({ queryKey: ["logs"] });
  if (c.includes("attendance")) qc.invalidateQueries({ queryKey: ["attendance"] });
  if (c.includes("sms") || c.includes("whatsapp")) {
    qc.invalidateQueries({ queryKey: ["whatsapp"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
  }
  if (c.includes("gym") || c.includes("branding")) {
    qc.invalidateQueries({ queryKey: ["gym-codes"] });
  }
}

/** Subscribe to backend SSE and invalidate React Query caches by collection. */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRealtimeConnected(false);
      return;
    }
    const token = readAuthToken();
    if (!token && !authCookieModeEnabled()) {
      setRealtimeConnected(false);
      return;
    }

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
        es.onopen = () => setRealtimeConnected(true);
        es.onmessage = (ev) => {
          setRealtimeConnected(true);
          try {
            const data = JSON.parse(ev.data) as { collection?: string };
            invalidateForCollection(qc, String(data.collection || ""));
          } catch {
            // ignore malformed frames
          }
        };
        es.onerror = () => {
          setRealtimeConnected(false);
          es.close();
          esRef.current = null;
          if (!closed) retryTimer = setTimeout(connect, 4000);
        };
      } catch {
        setRealtimeConnected(false);
        if (!closed) retryTimer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      closed = true;
      setRealtimeConnected(false);
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, qc]);
}
