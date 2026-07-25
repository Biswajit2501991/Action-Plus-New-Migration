"use client";

import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";

/** Production parity: max 5 undo steps. */
const HISTORY_LIMIT = 5;

export type AppSnapshot = {
  label: string;
  at: string;
  sig: string;
  members?: unknown;
  users?: unknown;
  visitors?: unknown;
  settingsDefault?: unknown;
  financeAll?: unknown;
};

type HistoryState = {
  past: AppSnapshot[];
  current: AppSnapshot | null;
  future: AppSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  /** Skip auto-capture while applying undo/redo (Production skipHistoryCaptureRef). */
  skipCapture: boolean;
  setSkipCapture: (v: boolean) => void;
  /**
   * Record a new app state as current. If it differs from the previous current,
   * push previous current onto past and clear future — Production useEffect behaviour.
   */
  record: (snap: AppSnapshot) => void;
  undo: () => AppSnapshot | null;
  redo: () => AppSnapshot | null;
  clear: () => void;
};

function caps(
  past: AppSnapshot[],
  current: AppSnapshot | null,
  future: AppSnapshot[],
  skipCapture = false,
) {
  return {
    past,
    current,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    skipCapture,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  current: null,
  future: [],
  canUndo: false,
  canRedo: false,
  skipCapture: false,
  setSkipCapture: (v) => set({ skipCapture: v }),
  record: (snap) => {
    const { skipCapture, current } = get();
    if (skipCapture) return;
    if (!current) {
      set(caps([], snap, [], false));
      return;
    }
    if (current.sig === snap.sig) return;
    // Avoid undo-to-empty during cold hydrate (members/users still loading).
    const currentReady = Array.isArray(current.members);
    const nextReady = Array.isArray(snap.members);
    if (!currentReady) {
      set(caps([], snap, [], false));
      return;
    }
    if (!nextReady) return;
    const nextPast = [...get().past, current].slice(-HISTORY_LIMIT);
    set(caps(nextPast, snap, [], false));
  },
  undo: () => {
    const { past, current, future } = get();
    if (!past.length || !current) return null;
    const target = past[past.length - 1];
    const nextPast = past.slice(0, -1);
    const nextFuture = [current, ...future].slice(0, HISTORY_LIMIT);
    set(caps(nextPast, target, nextFuture, get().skipCapture));
    return target;
  },
  redo: () => {
    const { past, current, future } = get();
    if (!future.length || !current) return null;
    const target = future[0];
    const nextFuture = future.slice(1);
    const nextPast = [...past, current].slice(-HISTORY_LIMIT);
    set(caps(nextPast, target, nextFuture, get().skipCapture));
    return target;
  },
  clear: () => set(caps([], null, [], false)),
}));

function stableSig(parts: Record<string, unknown>) {
  try {
    return JSON.stringify(parts);
  } catch {
    return String(Date.now());
  }
}

/** Capture tracked collections — same domains Production snapshots. */
export function captureAppSnapshot(qc: QueryClient, label = "state"): AppSnapshot {
  const members = qc.getQueryData(["members"]);
  const users = qc.getQueryData(["users"]);
  const visitors = qc.getQueryData(["visitors"]);
  const settingsDefault = qc.getQueryData(["settings", "default"]);
  const financeAll = qc.getQueryData(["finance", "all"]);
  const payload = { members, users, visitors, settingsDefault, financeAll };
  return {
    label,
    at: new Date().toISOString(),
    sig: stableSig(payload),
    ...payload,
  };
}

export function restoreAppSnapshot(qc: QueryClient, snap: AppSnapshot) {
  const store = useHistoryStore.getState();
  store.setSkipCapture(true);
  if (snap.members !== undefined) qc.setQueriesData({ queryKey: ["members"] }, () => snap.members);
  if (snap.users !== undefined) qc.setQueryData(["users"], snap.users);
  if (snap.visitors !== undefined) qc.setQueriesData({ queryKey: ["visitors"] }, () => snap.visitors);
  if (snap.settingsDefault !== undefined) {
    qc.setQueryData(["settings", "default"], snap.settingsDefault);
  }
  if (snap.financeAll !== undefined) {
    qc.setQueryData(["finance", "all"], snap.financeAll);
  }
  // Allow React to flush before re-enabling capture (Production setTimeout 0).
  queueMicrotask(() => {
    useHistoryStore.getState().setSkipCapture(false);
  });
}

/**
 * Explicit checkpoint before a mutation — Production auto-captures after state
 * settles; this seeds the same stack when callers want a labelled step.
 * Safe no-op if auto-capture already recorded an identical signature.
 */
export function pushHistoryCheckpoint(qc: QueryClient, label: string) {
  useHistoryStore.getState().record(captureAppSnapshot(qc, label));
}

export function applyUndo(qc: QueryClient): AppSnapshot | null {
  const target = useHistoryStore.getState().undo();
  if (!target) return null;
  restoreAppSnapshot(qc, target);
  return target;
}

export function applyRedo(qc: QueryClient): AppSnapshot | null {
  const target = useHistoryStore.getState().redo();
  if (!target) return null;
  restoreAppSnapshot(qc, target);
  return target;
}
