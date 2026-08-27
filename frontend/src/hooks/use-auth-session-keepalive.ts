"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authCookieModeEnabled } from "@/lib/auth-cookie-mode";
import {
  AUTH_SESSION_IDLE_MS,
  AUTH_SESSION_KEY,
  AUTH_SESSION_TTL_MS,
  clearAuthSession,
  isAuthSessionExpired,
  readAuthSession,
  readAuthTokenExpiresAtMs,
  touchAuthSessionActivity,
  type AuthSession,
} from "@/lib/auth-storage";
import { clearAppQueryCache } from "@/lib/query-cache";
import { refreshSession } from "@/services/api/auth";
import { useAuthStore } from "@/stores";

const ACTIVITY_DEBOUNCE_MS = 4000;
const URGENT_CLIENT_MS = 10 * 60 * 1000;
const JWT_REFRESH_WITHIN_MS = 20 * 60 * 1000;
const COOKIE_REFRESH_EVERY_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "touchstart",
  "scroll",
  "pointerdown",
  "mousemove",
] as const;

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

/**
 * Keep staff sessions alive on interactive activity (90m idle / 2h JWT slide).
 * Matches classic Gym Manager session behavior without changing payments or auth data.
 */
export function useAuthSessionKeepalive(enabled: boolean) {
  const router = useRouter();
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  const lastTouchAtRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    endingRef.current = false;
    lastTouchAtRef.current = Date.now();
    lastRefreshAtRef.current = Date.now();

    const endSession = (message: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      clearAuthSession();
      clearAppQueryCache(qc);
      clear();
      toast.error(message);
      router.replace("/login");
    };

    const maybeRefreshJwt = async () => {
      const session = readAuthSession();
      if (!session) return;

      const now = Date.now();
      if (now - lastRefreshAtRef.current < 60_000) return;

      let needRefresh = false;
      if (authCookieModeEnabled()) {
        needRefresh = now - lastRefreshAtRef.current >= COOKIE_REFRESH_EVERY_MS;
      } else {
        const expMs = readAuthTokenExpiresAtMs(session.token);
        if (expMs == null) {
          // Unknown exp — refresh halfway through client TTL while active.
          needRefresh = now - lastRefreshAtRef.current >= AUTH_SESSION_TTL_MS / 2;
        } else {
          const jwtMsLeft = expMs - now;
          needRefresh = jwtMsLeft > 0 && jwtMsLeft < JWT_REFRESH_WITHIN_MS;
        }
      }
      if (!needRefresh) return;
      if (refreshInFlightRef.current) return refreshInFlightRef.current;

      refreshInFlightRef.current = (async () => {
        try {
          await refreshSession();
          lastRefreshAtRef.current = Date.now();
        } catch {
          // 401 clears via apiFetch; soft failures leave current session alone.
        } finally {
          refreshInFlightRef.current = null;
        }
      })();

      return refreshInFlightRef.current;
    };

    const extendSession = () => {
      const now = Date.now();
      const parsed = readStoredSession();
      if (!parsed?.userId || isAuthSessionExpired(parsed, now)) {
        endSession("Session expired. Please sign in again.");
        return;
      }
      const msLeft = Number(parsed.expiresAt || 0) - now;
      const urgent = msLeft > 0 && msLeft < URGENT_CLIENT_MS;
      if (!urgent && now - lastTouchAtRef.current < ACTIVITY_DEBOUNCE_MS) return;
      lastTouchAtRef.current = now;
      if (!touchAuthSessionActivity()) {
        endSession("Session expired. Please sign in again.");
        return;
      }
      void maybeRefreshJwt();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const parsed = readStoredSession();
      if (!parsed?.userId || isAuthSessionExpired(parsed)) {
        endSession("Session expired. Please sign in again.");
        return;
      }
      extendSession();
      void maybeRefreshJwt();
    };

    extendSession();
    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, extendSession, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(() => {
      const parsed = readStoredSession();
      if (!parsed?.userId) {
        endSession("Session expired. Please sign in again.");
        return;
      }
      if (isAuthSessionExpired(parsed)) {
        endSession(
          parsed.lastActivityAt &&
            Date.now() - Number(parsed.lastActivityAt) > AUTH_SESSION_IDLE_MS
            ? "Signed out after 90 minutes of inactivity. Please sign in again."
            : "Session expired. Please sign in again.",
        );
        return;
      }
      void maybeRefreshJwt();
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, extendSession));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, clear, qc, router]);
}
