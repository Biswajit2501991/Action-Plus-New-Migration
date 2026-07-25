"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { attendanceApi } from "@/services/api";
import {
  ATTENDANCE_NOTE_CATEGORIES,
  ATTENDANCE_NOTE_CATEGORY_LABELS,
  ATTENDANCE_NOTE_MAX_LENGTH,
  isAttendanceNotesEnabled,
  isLoginLateForShift,
  resolveBranchShiftConfig,
  validateAttendanceNotePayload,
} from "@/lib/domain/attendance";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import { hasAccess } from "@/lib/domain/permissions";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { useAuthStore, useUiStore } from "@/stores";

function dismissedKey(userId: string, dateKey: string) {
  return `apg.lateNote.dismissed.${dateKey}.${String(userId || "").trim().toLowerCase()}`;
}

function wasDismissedToday(userId: string, dateKey: string) {
  try {
    return sessionStorage.getItem(dismissedKey(userId, dateKey)) === "1";
  } catch {
    return false;
  }
}

function markDismissedToday(userId: string, dateKey: string) {
  try {
    sessionStorage.setItem(dismissedKey(userId, dateKey), "1");
  } catch {
    /* ignore */
  }
}

export function LateArrivalNoteHost() {
  const user = useAuthStore((s) => s.user);
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();
  const lateNoteOpen = useUiStore((s) => s.lateNoteOpen);
  const setLateNoteOpen = useUiStore((s) => s.setLateNoteOpen);
  const justLoggedInAt = useUiStore((s) => s.justLoggedInAt);
  const setJustLoggedInAt = useUiStore((s) => s.setJustLoggedInAt);

  const [category, setCategory] = useState("traffic");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const notesEnabled = isAttendanceNotesEnabled(settings as Record<string, unknown>);
  const canSubmit = Boolean(user) && hasAccess(user, "attendance", "submitOwnLateNote");

  const closeModal = (markDismissed = true) => {
    if (markDismissed && user?.id) {
      markDismissedToday(user.id, localTodayCalendarKey());
    }
    setLateNoteOpen(false);
    setError("");
    setNote("");
    setCategory("traffic");
  };

  useEffect(() => {
    if (!user?.id || !notesEnabled || !canSubmit || lateNoteOpen) return;
    const today = localTodayCalendarKey();
    if (wasDismissedToday(user.id, today)) {
      if (justLoggedInAt) setJustLoggedInAt(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      // Prefer auto-prompt right after login when the feature is on.
      // Also prompt when returning mid-day if the login punch was after shift start.
      const loginAt =
        justLoggedInAt ||
        String(
          (await attendanceApi.selfToday().catch(() => null))?.firstLoginAt || "",
        ).trim();

      if (!loginAt && !justLoggedInAt) return;

      const shiftCfg = resolveBranchShiftConfig(
        gymCodes,
        String(user.activeBranchId || user.gymCodeId || "").trim(),
      );

      const isLate = Boolean(
        loginAt &&
          shiftCfg.shiftStartTime &&
          isLoginLateForShift(loginAt, shiftCfg.shiftStartTime, {
            shiftTimezone: shiftCfg.shiftTimezone,
          }),
      );

      // Auto-open when feature is enabled after login, or whenever late for shift.
      const shouldAutoOpen = Boolean(justLoggedInAt) || isLate;
      if (!shouldAutoOpen) return;

      try {
        const existing = await attendanceApi.latestNote({
          date: today,
          staffLoginId: user.id,
        });
        if (cancelled) return;
        if (existing) {
          if (justLoggedInAt) setJustLoggedInAt(null);
          return;
        }
      } catch {
        /* still allow prompt if latest-note lookup fails */
      }

      if (cancelled) return;
      setLateNoteOpen(true);
      if (justLoggedInAt) setJustLoggedInAt(null);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.activeBranchId,
    user?.gymCodeId,
    notesEnabled,
    canSubmit,
    lateNoteOpen,
    justLoggedInAt,
    gymCodes,
    setJustLoggedInAt,
    setLateNoteOpen,
  ]);

  const submit = async () => {
    try {
      setError("");
      const payload = validateAttendanceNotePayload({
        noteCategory: category,
        note,
      });
      setSaving(true);
      await attendanceApi.addNote({
        ...payload,
        attendanceDate: localTodayCalendarKey(),
      });
      toast.success("Late note saved");
      closeModal(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save late note";
      setError(
        msg.includes("attendance-notes-feature-disabled")
          ? "Attendance notes are disabled. Ask the owner to enable Settings → Attendance late notes."
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  if (!lateNoteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
      data-testid="attendance-late-note-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="late-arrival-note-title"
    >
      <div className="relative w-full max-w-md">
        <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-amber-400/20 blur-xl" />
        <div className="relative w-full space-y-3 rounded-2xl border border-amber-200/80 bg-background p-4 shadow-2xl dark:border-amber-500/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <h2
                id="late-arrival-note-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Late arrival note
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a short reason for your manager (stored 60 days).
              </p>
            </div>
            <button
              type="button"
              onClick={() => closeModal(true)}
              aria-label="Close late note popup"
              data-testid="attendance-late-note-close"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <Select
              className="mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {ATTENDANCE_NOTE_CATEGORIES.filter((c) => c !== "optional").map((c) => (
                <option key={c} value={c}>
                  {ATTENDANCE_NOTE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Note</label>
            <Textarea
              className="mt-1 min-h-[96px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief reason for being late…"
              maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => closeModal(true)} disabled={saving}>
              Not now
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : "Save note"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
