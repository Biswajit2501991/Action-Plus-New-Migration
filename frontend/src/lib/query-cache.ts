import { QueryClient, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import { readAuthSession } from "@/lib/auth-storage";

/** localStorage key for dehydrated React Query cache (instant section loads). */
export const APP_QUERY_CACHE_KEY = "apg.rq.v2";

/** Bump to invalidate all persisted caches after breaking shape changes. */
export const APP_QUERY_CACHE_VERSION = "v3";

export const STALE = {
  /** Large lists used across many sections */
  lists: 5 * 60_000,
  /** Settings / gym codes change rarely */
  settings: 10 * 60_000,
  /** Finance / attendance month windows */
  finance: 3 * 60_000,
  /** Logs / messaging */
  volatile: 90_000,
} as const;

export const GC_TIME = 24 * 60 * 60_000; // keep for persist window
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

const PERSIST_ROOT_KEYS = new Set([
  "members",
  "visitors",
  "users",
  "settings",
  "finance",
  "finance-year",
  "logs",
  "attendance",
  "gym-codes",
  "whatsapp",
  "leave-balance",
  "attendance-notes",
  "whatsapp-templates",
]);

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.lists,
        gcTime: GC_TIME,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}

export function createAppQueryPersister(): Persister | null {
  if (typeof window === "undefined") return null;
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: APP_QUERY_CACHE_KEY,
    throttleTime: 1000,
  });
}

export function appQueryPersistBuster() {
  const userId = readAuthSession()?.userId || "anon";
  return `${APP_QUERY_CACHE_VERSION}:${userId}`;
}

export function shouldPersistQuery(query: Query) {
  const root = String(query.queryKey?.[0] || "");
  if (!PERSIST_ROOT_KEYS.has(root)) return false;
  return query.state.status === "success";
}

/** Drop in-memory + persisted cache (logout / account switch). */
export function clearAppQueryCache(client: QueryClient, persister?: Persister | null) {
  client.clear();
  try {
    persister?.removeClient();
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(APP_QUERY_CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

/** Branch-scoped collections must refresh after active branch changes. */
export function invalidateBranchScopedQueries(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["members"] }),
    client.invalidateQueries({ queryKey: ["visitors"] }),
    client.invalidateQueries({ queryKey: ["users"] }),
    client.invalidateQueries({ queryKey: ["finance"] }),
    client.invalidateQueries({ queryKey: ["finance-year"] }),
    client.invalidateQueries({ queryKey: ["attendance"] }),
    client.invalidateQueries({ queryKey: ["attendance-notes"] }),
    client.invalidateQueries({ queryKey: ["whatsapp"] }),
    client.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
    client.invalidateQueries({ queryKey: ["leave-balance"] }),
    client.invalidateQueries({ queryKey: ["logs"] }),
    client.invalidateQueries({ queryKey: ["settings"] }),
    client.invalidateQueries({ queryKey: ["gym-codes"] }),
  ]);
}
