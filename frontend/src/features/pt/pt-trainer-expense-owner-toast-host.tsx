"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ptTrainerExpenseApi } from "@/services/api";
import { isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";

function istDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayKey(userId: string, pendingId: string) {
  return `apg.ptPayoutOwnerToast.${String(userId || "").toLowerCase()}.${pendingId}.${istDateKey()}`;
}

function already(userId: string, pendingId: string) {
  try {
    return localStorage.getItem(dayKey(userId, pendingId)) === "1";
  } catch {
    return false;
  }
}

function mark(userId: string, pendingId: string) {
  try {
    localStorage.setItem(dayKey(userId, pendingId), "1");
  } catch {
    /* ignore */
  }
}

/** Owner login: toast open PT payouts; action to dismiss/clear. */
export function PtTrainerExpenseOwnerToastHost() {
  const user = useAuthStore((s) => s.user);
  const justLoggedInAt = useUiStore((s) => s.justLoggedInAt);
  const pendingLoginAtRef = useRef<string | null>(null);
  const handledLoginAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (justLoggedInAt) pendingLoginAtRef.current = justLoggedInAt;
  }, [justLoggedInAt]);

  useEffect(() => {
    const loginAt = pendingLoginAtRef.current;
    if (!user?.id || !loginAt) return;
    if (!isMasterOwnerUser(user)) return;
    if (handledLoginAtRef.current === loginAt) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await ptTrainerExpenseApi.pending();
        if (cancelled) return;
        handledLoginAtRef.current = loginAt;
        pendingLoginAtRef.current = null;
        const list = Array.isArray(res.pending) ? res.pending : [];
        for (const row of list.slice(0, 5)) {
          if (!row.id || already(user.id, row.id)) continue;
          mark(user.id, row.id);
          const msg =
            row.message ||
            `PT payment pending for Trainer ${row.trainerName} – ${row.memberName} (${row.monthLabel}).`;
          toast.message(msg, {
            duration: 12_000,
            action: {
              label: "Clear",
              onClick: () => {
                void ptTrainerExpenseApi
                  .dismiss(row.id!)
                  .then(() => toast.success("Pending payout cleared."))
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Could not clear."),
                  );
              },
            },
          });
        }
      } catch {
        handledLoginAtRef.current = loginAt;
        pendingLoginAtRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, justLoggedInAt]);

  return null;
}
