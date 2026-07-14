"use client";

import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";

const HISTORY_LIMIT = 5;

type Snapshot = {
  label: string;
  at: string;
  members?: unknown;
  users?: unknown;
  settingsDefault?: unknown;
  finance?: unknown;
};

type HistoryState = {
  past: Snapshot[];
  future: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;
  push: (snap: Snapshot) => void;
  undo: () => Snapshot | null;
  redo: () => Snapshot | null;
  clear: () => void;
};

function caps(past: Snapshot[], future: Snapshot[]) {
  return {
    past,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  push: (snap) => {
    const past = [...get().past, snap].slice(-HISTORY_LIMIT);
    set(caps(past, []));
  },
  undo: () => {
    const { past, future } = get();
    if (!past.length) return null;
    const current = past[past.length - 1];
    const nextPast = past.slice(0, -1);
    set(caps(nextPast, [current, ...future].slice(0, HISTORY_LIMIT)));
    return current;
  },
  redo: () => {
    const { past, future } = get();
    if (!future.length) return null;
    const current = future[0];
    set(caps([...past, current].slice(-HISTORY_LIMIT), future.slice(1)));
    return current;
  },
  clear: () => set(caps([], [])),
}));

export function captureAppSnapshot(qc: QueryClient, label: string): Snapshot {
  return {
    label,
    at: new Date().toISOString(),
    members: qc.getQueryData(["members"]),
    users: qc.getQueryData(["users"]),
    settingsDefault: qc.getQueryData(["settings", "default"]),
    finance: undefined,
  };
}

export function restoreAppSnapshot(qc: QueryClient, snap: Snapshot) {
  if (snap.members !== undefined) qc.setQueryData(["members"], snap.members);
  if (snap.users !== undefined) qc.setQueryData(["users"], snap.users);
  if (snap.settingsDefault !== undefined) {
    qc.setQueryData(["settings", "default"], snap.settingsDefault);
  }
}

export function pushHistoryCheckpoint(qc: QueryClient, label: string) {
  useHistoryStore.getState().push(captureAppSnapshot(qc, label));
}
