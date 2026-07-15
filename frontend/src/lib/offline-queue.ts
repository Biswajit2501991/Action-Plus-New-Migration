/**
 * Lightweight offline mutation queue for V2.
 * Queues failed / offline member writes and flushes when the browser is online.
 */

export type OfflineQueueItem = {
  id: string;
  createdAt: string;
  kind: "member.patch" | "member.permanentDelete" | "member.bulk";
  memberId?: string;
  payload?: unknown;
};

const STORAGE_KEY = "apg.v2.offlineQueue";

function uid() {
  return `oq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-200)));
}

export function getOfflineQueueCount() {
  return readOfflineQueue().length;
}

export function enqueueOfflineMutation(
  item: Omit<OfflineQueueItem, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  const next: OfflineQueueItem = {
    id: item.id || uid(),
    createdAt: item.createdAt || new Date().toISOString(),
    kind: item.kind,
    memberId: item.memberId,
    payload: item.payload,
  };
  const list = readOfflineQueue();
  // Coalesce same-member patches: keep latest patch only.
  const filtered =
    next.kind === "member.patch" && next.memberId
      ? list.filter(
          (row) => !(row.kind === "member.patch" && row.memberId === next.memberId),
        )
      : list.filter((row) => row.id !== next.id);
  writeOfflineQueue([...filtered, next]);
  return next;
}

export function removeOfflineMutation(id: string) {
  writeOfflineQueue(readOfflineQueue().filter((row) => row.id !== id));
}

export function clearOfflineQueue() {
  writeOfflineQueue([]);
}

export function isBrowserOffline() {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

export function isLikelyNetworkError(err: unknown) {
  if (isBrowserOffline()) return true;
  if (!(err instanceof Error)) return false;
  const msg = String(err.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("offline")
  );
}
