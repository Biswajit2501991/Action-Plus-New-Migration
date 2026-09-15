"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ptTrainerExpenseApi, type PtTrainerExpensePending } from "@/services/api";
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

function declinedToastKey(userId: string, pendingId: string, day: string) {
  return `apg.ptExpensePrompt.${String(userId || "").toLowerCase()}.${pendingId}.${day}`;
}

function wasShownDeclinedToday(userId: string, pendingId: string) {
  try {
    return localStorage.getItem(declinedToastKey(userId, pendingId, istDateKey())) === "1";
  } catch {
    return false;
  }
}

function markDeclinedShown(userId: string, pendingId: string) {
  try {
    localStorage.setItem(declinedToastKey(userId, pendingId, istDateKey()), "1");
  } catch {
    /* ignore */
  }
}

/**
 * Trainer login popup: confirm PT payout Yes/No → Cash/Online.
 * pending = every login; declined = once per IST day.
 */
export function PtTrainerExpensePromptHost() {
  const user = useAuthStore((s) => s.user);
  const justLoggedInAt = useUiStore((s) => s.justLoggedInAt);
  const pendingLoginAtRef = useRef<string | null>(null);
  const handledLoginAtRef = useRef<string | null>(null);

  const [item, setItem] = useState<PtTrainerExpensePending | null>(null);
  const [step, setStep] = useState<"ask" | "method">("ask");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (justLoggedInAt) pendingLoginAtRef.current = justLoggedInAt;
  }, [justLoggedInAt]);

  useEffect(() => {
    const loginAt = pendingLoginAtRef.current;
    if (!user?.id || !loginAt) return;
    if (isMasterOwnerUser(user)) return;
    if (handledLoginAtRef.current === loginAt) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await ptTrainerExpenseApi.pending();
        if (cancelled) return;
        const list = Array.isArray(res.pending) ? res.pending : [];
        const next =
          list.find((p) => p.status === "pending") ||
          list.find(
            (p) =>
              p.status === "declined" &&
              p.id &&
              !wasShownDeclinedToday(user.id, p.id),
          ) ||
          null;
        handledLoginAtRef.current = loginAt;
        pendingLoginAtRef.current = null;
        if (!next) return;
        if (next.status === "declined" && next.id) {
          markDeclinedShown(user.id, next.id);
        }
        setItem(next);
        setStep("ask");
      } catch {
        handledLoginAtRef.current = loginAt;
        pendingLoginAtRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, justLoggedInAt]);

  if (!item) return null;

  const memberName = item.memberName || item.memberCode || "member";

  const onNo = async () => {
    if (!item.id || busy) return;
    setBusy(true);
    try {
      await ptTrainerExpenseApi.decline(item.id);
      toast.message("Marked as not paid yet. We’ll ask again tomorrow.");
      setItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const onYes = () => setStep("method");

  const onMethod = async (method: "cash" | "online") => {
    if (!item.id || busy) return;
    setBusy(true);
    try {
      await ptTrainerExpenseApi.confirm(item.id, method);
      toast.success("PT payout recorded as expense.");
      setItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
        {step === "ask" ? (
          <>
            <p className="text-base font-semibold text-foreground">
              Your PT – {memberName} payment has been cleared to you?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.monthLabel || item.serviceMonth}
              {item.amountInr != null ? ` · ₹${Number(item.amountInr).toLocaleString("en-IN")}` : ""}
            </p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={onYes}>
                Yes
              </Button>
              <Button className="flex-1" variant="outline" disabled={busy} onClick={onNo}>
                No
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-foreground">How were you paid?</p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => onMethod("cash")}>
                Cash
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => onMethod("online")}>
                Online
              </Button>
            </div>
            <button
              type="button"
              className="mt-3 text-xs text-muted-foreground underline"
              onClick={() => setStep("ask")}
              disabled={busy}
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
