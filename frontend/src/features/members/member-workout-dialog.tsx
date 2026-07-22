"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { DEFAULT_EXERCISE_TYPES } from "@/lib/domain/pt-defaults";
import {
  buildPtMonthCalendarCells,
  parsePtDateKey,
  ptDateKeyFromParts,
} from "@/lib/domain/pt-calendar";
import { cn } from "@/lib/utils";
import type { Member } from "@/types";

type DayLog = {
  exercises: string[];
  notes: string;
  source?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function todayKeyLocal() {
  const d = new Date();
  return ptDateKeyFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

export function MemberWorkoutDialog({
  open,
  member,
  exerciseTypes,
  canEdit,
  onClose,
}: {
  open: boolean;
  member: Member | null;
  exerciseTypes?: string[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const list =
      Array.isArray(exerciseTypes) && exerciseTypes.length
        ? exerciseTypes
        : [...DEFAULT_EXERCISE_TYPES];
    return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
  }, [exerciseTypes]);

  const [byDate, setByDate] = useState<Record<string, DayLog>>({});
  const [workoutDate, setWorkoutDate] = useState(todayKeyLocal());
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const todayParts = parsePtDateKey(workoutDate) || {
    year: new Date().getFullYear(),
    monthIndex: new Date().getMonth(),
    day: new Date().getDate(),
  };
  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonthIndex, setViewMonthIndex] = useState(todayParts.monthIndex);

  const focusMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(byDate)) {
      if (v.exercises?.length) map[k] = v.exercises.join(", ");
    }
    return map;
  }, [byDate]);

  const monthCells = useMemo(
    () => buildPtMonthCalendarCells(viewYear, viewMonthIndex, focusMap),
    [viewYear, viewMonthIndex, focusMap],
  );

  const load = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      const key = encodeURIComponent(member.memberId || member.memberUuid || "");
      const data = await apiFetch<{
        ok?: boolean;
        byDate?: Record<string, DayLog>;
      }>(`/member-daily-workouts/${key}`);
      setByDate(data.byDate || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load workouts");
      setByDate({});
    } finally {
      setLoading(false);
    }
  }, [member]);

  useEffect(() => {
    if (!open || !member) return;
    const today = todayKeyLocal();
    setWorkoutDate(today);
    const parts = parsePtDateKey(today);
    if (parts) {
      setViewYear(parts.year);
      setViewMonthIndex(parts.monthIndex);
    }
    void load();
  }, [open, member, load]);

  useEffect(() => {
    const row = byDate[workoutDate];
    setSelected(row?.exercises ? [...row.exercises] : []);
    setNotes(row?.notes || "");
  }, [workoutDate, byDate]);

  function selectDay(key: string) {
    setWorkoutDate(key);
    const parts = parsePtDateKey(key);
    if (parts) {
      setViewYear(parts.year);
      setViewMonthIndex(parts.monthIndex);
    }
  }

  function toggleExercise(label: string) {
    if (!canEdit) return;
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );
  }

  async function save() {
    if (!member || !canEdit) return;
    setBusy(true);
    try {
      const key = encodeURIComponent(member.memberId || member.memberUuid || "");
      await apiFetch(`/member-daily-workouts/${key}`, {
        method: "PUT",
        body: JSON.stringify({
          workoutDate,
          exercises: selected,
          notes,
        }),
      });
      toast.success(
        selected.length || notes.trim()
          ? `Saved workout for ${workoutDate}`
          : `Cleared workout for ${workoutDate}`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!member) return null;

  return (
    <ClassicalModal
      open={open}
      onClose={onClose}
      title={`Workout · ${member.fullName || member.memberId}`}
      description="Log exercises for each day. Data stays until cleared or the member is removed."
      size="lg"
    >
      <div className="space-y-4 p-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="member-workout-date">Workout date</Label>
            <Input
              id="member-workout-date"
              type="date"
              value={workoutDate}
              onChange={(e) => selectDay(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : focusMap[workoutDate]
                ? `Saved: ${focusMap[workoutDate]}`
                : "No exercises saved for this day yet."}
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {MONTHS[viewMonthIndex]} {viewYear}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => {
                  const d = new Date(viewYear, viewMonthIndex - 1, 1);
                  setViewYear(d.getFullYear());
                  setViewMonthIndex(d.getMonth());
                }}
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => {
                  const d = new Date(viewYear, viewMonthIndex + 1, 1);
                  setViewYear(d.getFullYear());
                  setViewMonthIndex(d.getMonth());
                }}
              >
                Next
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((cell) => {
              if (cell.kind === "pad") {
                return <div key={cell.key} className="min-h-9" />;
              }
              const active = cell.key === workoutDate;
              return (
                <button
                  key={cell.key}
                  type="button"
                  title={cell.focus || undefined}
                  onClick={() => selectDay(cell.key)}
                  className={cn(
                    "min-h-9 rounded-md border text-[11px] transition",
                    cell.hasFocus
                      ? "border-emerald-400/70 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-transparent bg-muted/40 text-foreground",
                    active && "ring-2 ring-teal-500",
                    cell.isSunday && "opacity-60",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Exercises for {workoutDate}</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((label) => {
              const on = selected.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => toggleExercise(label)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    on
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-border bg-background text-foreground hover:border-teal-400",
                    (!canEdit || busy) && "opacity-60",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-workout-notes">Notes (optional)</Label>
            <Input
              id="member-workout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit || busy}
              placeholder="Sets, reps, or how the session went"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {canEdit ? (
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : selected.length || notes.trim() ? "Save day" : "Clear day"}
            </Button>
          ) : null}
        </div>
      </div>
    </ClassicalModal>
  );
}
