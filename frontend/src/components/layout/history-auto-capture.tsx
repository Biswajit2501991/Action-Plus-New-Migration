"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  captureAppSnapshot,
  useHistoryStore,
} from "@/lib/history-stack";

const TRACKED_ROOTS = new Set(["members", "users", "visitors", "settings", "finance"]);

/**
 * Production parity: whenever tracked app data changes, push the previous
 * snapshot onto the undo stack and clear redo (index.html history useEffect).
 */
export function HistoryAutoCapture() {
  const qc = useQueryClient();
  const bootstrapped = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useHistoryStore.getState().record(captureAppSnapshot(qc, "initial"));
    bootstrapped.current = true;

    const queueRecord = (label: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (useHistoryStore.getState().skipCapture) return;
        useHistoryStore.getState().record(captureAppSnapshot(qc, label));
      }, 0);
    };

    const unsub = qc.getQueryCache().subscribe((event) => {
      if (!bootstrapped.current) return;
      if (event?.type !== "updated" && event?.type !== "removed") return;
      const key = event.query?.queryKey;
      if (!Array.isArray(key) || !key.length) return;
      const root = String(key[0] || "");
      if (!TRACKED_ROOTS.has(root)) return;
      if (root === "settings" && key[1] !== "default") return;
      if (root === "finance" && key[1] !== "all") return;
      if (useHistoryStore.getState().skipCapture) return;
      queueRecord(root);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsub();
    };
  }, [qc]);

  return null;
}
