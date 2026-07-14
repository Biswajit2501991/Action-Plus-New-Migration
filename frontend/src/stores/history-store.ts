import { create } from "zustand";
import type { AppSettings, FinanceTransaction, Member, StaffUser } from "@/types";
import { financeApi, logsApi, membersApi, settingsApi, usersApi } from "@/services/api";

const HISTORY_LIMIT = 5;

export type HistorySnapshot = {
  id: string;
  label: string;
  at: string;
  members?: Member[];
  users?: StaffUser[];
  settings?: Partial<AppSettings> | null;
  financeTransactions?: FinanceTransaction[];
};

type HistoryState = {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  busy: boolean;
  push: (snap: HistorySnapshot) => void;
  undo: () => Promise<HistorySnapshot | null>;
  redo: () => Promise<HistorySnapshot | null>;
  clear: () => void;
};

function cloneSnap(snap: HistorySnapshot): HistorySnapshot {
  return JSON.parse(JSON.stringify(snap)) as HistorySnapshot;
}

async function restoreSnapshot(snap: HistorySnapshot) {
  if (Array.isArray(snap.members)) {
    await membersApi.bulk(snap.members);
  }
  if (Array.isArray(snap.users)) {
    await usersApi.bulk(snap.users);
  }
  if (snap.settings && typeof snap.settings === "object") {
    await settingsApi.bulk(snap.settings);
  }
  if (Array.isArray(snap.financeTransactions)) {
    await financeApi.bulk(snap.financeTransactions);
  }
  try {
    await logsApi.create({
      action: "history.undo",
      entityType: "history",
      entityId: "global",
      after: { label: snap.label, at: snap.at },
    });
  } catch {
    /* audit is best-effort */
  }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  busy: false,
  push: (snap) => {
    const next = cloneSnap(snap);
    next.id = next.id || `hist_${Date.now()}`;
    next.at = next.at || new Date().toISOString();
    set({
      past: [...get().past, next].slice(-HISTORY_LIMIT),
      future: [],
    });
  },
  undo: async () => {
    const { past, future, busy } = get();
    if (busy || !past.length) return null;
    const current = past[past.length - 1];
    set({ busy: true });
    try {
      await restoreSnapshot(current);
      set({
        past: past.slice(0, -1),
        future: [current, ...future].slice(0, HISTORY_LIMIT),
        busy: false,
      });
      return current;
    } catch (e) {
      set({ busy: false });
      throw e;
    }
  },
  redo: async () => {
    const { past, future, busy } = get();
    if (busy || !future.length) return null;
    const next = future[0];
    set({ busy: true });
    try {
      await restoreSnapshot(next);
      try {
        await logsApi.create({
          action: "history.redo",
          entityType: "history",
          entityId: "global",
          after: { label: next.label, at: next.at },
        });
      } catch {
        /* ignore */
      }
      set({
        past: [...past, next].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        busy: false,
      });
      return next;
    } catch (e) {
      set({ busy: false });
      throw e;
    }
  },
  clear: () => set({ past: [], future: [], busy: false }),
}));

/** Capture current React Query cache as an undo checkpoint before a write. */
export function captureHistoryFromCache(
  qc: { getQueryData: (key: readonly unknown[]) => unknown },
  label: string,
) {
  const members = qc.getQueryData(["members"]) as Member[] | undefined;
  const users = qc.getQueryData(["users"]) as StaffUser[] | undefined;
  const settings =
    (qc.getQueryData(["settings", "default"]) as AppSettings | undefined) ||
    (qc.getQueryData(["settings"]) as AppSettings | undefined);
  const finance = qc.getQueryData(["finance", "all"]) as
    | { transactions?: FinanceTransaction[] }
    | FinanceTransaction[]
    | undefined;
  const financeTransactions = Array.isArray(finance)
    ? finance
    : Array.isArray(finance?.transactions)
      ? finance.transactions
      : undefined;

  useHistoryStore.getState().push({
    id: `hist_${Date.now()}`,
    label,
    at: new Date().toISOString(),
    members: members ? JSON.parse(JSON.stringify(members)) : undefined,
    users: users ? JSON.parse(JSON.stringify(users)) : undefined,
    settings: settings ? JSON.parse(JSON.stringify(settings)) : undefined,
    financeTransactions: financeTransactions
      ? JSON.parse(JSON.stringify(financeTransactions))
      : undefined,
  });
}
