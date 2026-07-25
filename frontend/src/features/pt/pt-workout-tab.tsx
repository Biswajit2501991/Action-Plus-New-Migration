"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { buildPtMonthCalendarCells, parsePtDateKey, ptDateKeyFromParts } from "@/lib/domain/pt-calendar";
import { isoDate } from "@/lib/domain/member-dates";
import { cn, formatDate } from "@/lib/utils";
import type { Member, StaffUser } from "@/types";
import type { PtClientProfile } from "@/types/pt";

const FOCUS_PER_PAGE = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
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

type FocusDraft = { memberId: string; dateKey: string; focus: string | null } | null;

export function PtWorkoutTab({
  member,
  profile,
  trainers,
  focusOptions,
  canEdit,
  sectionSaving,
  onPersistTrainer,
  onSaveNotes,
  onSaveFocus,
  workoutNotesDraft,
  onWorkoutNotesChange,
  workoutNotesDirty,
  reviewPending,
  onConfirmReview,
}: {
  member: Member;
  profile: PtClientProfile;
  trainers: StaffUser[];
  focusOptions: string[];
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  onPersistTrainer: (trainerId: string) => void;
  onSaveNotes: () => void;
  onSaveFocus: (focus: string | null, dateKey: string) => Promise<boolean>;
  workoutNotesDraft: string;
  onWorkoutNotesChange: (v: string) => void;
  workoutNotesDirty: boolean;
  reviewPending: boolean;
  onConfirmReview: () => void;
}) {
  const [workoutDate, setWorkoutDate] = useState(isoDate(new Date()));
  const [workoutCalendarOpen, setWorkoutCalendarOpen] = useState(true);
  const [focusPage, setFocusPage] = useState(1);
  const [focusScheduleDraft, setFocusScheduleDraft] = useState<FocusDraft>(null);
  const [focusScheduleSaving, setFocusScheduleSaving] = useState(false);

  const savedFocusByDate = profile.focusByDate || {};
  const workoutDateKey = isoDate(workoutDate || new Date());
  const dateParts =
    parsePtDateKey(workoutDateKey) ||
    parsePtDateKey(new Date()) || {
      year: new Date().getFullYear(),
      monthIndex: new Date().getMonth(),
      day: 1,
    };

  const focusDraftApplies = Boolean(
    focusScheduleDraft &&
      focusScheduleDraft.memberId === member.memberId &&
      focusScheduleDraft.dateKey === workoutDateKey,
  );

  const savedFocusForDate = savedFocusByDate[workoutDateKey] || "";
  const focusScheduleDirty = focusDraftApplies && (focusScheduleDraft?.focus || "") !== savedFocusForDate;

  const displayFocusByDate = useMemo(() => {
    const next = { ...savedFocusByDate };
    if (focusDraftApplies && focusScheduleDraft) {
      if (focusScheduleDraft.focus) next[workoutDateKey] = focusScheduleDraft.focus;
      else delete next[workoutDateKey];
    }
    return next;
  }, [savedFocusByDate, focusDraftApplies, focusScheduleDraft, workoutDateKey]);

  useEffect(() => {
    setFocusScheduleDraft(null);
  }, [member.memberId]);

  useEffect(() => {
    setFocusScheduleDraft((prev) => {
      if (!prev || prev.memberId !== member.memberId || prev.dateKey === workoutDateKey) return prev;
      return null;
    });
  }, [workoutDateKey, member.memberId]);

  const monthCalendarCells = buildPtMonthCalendarCells(
    dateParts.year,
    dateParts.monthIndex,
    displayFocusByDate,
  );
  const ptDaysDone = monthCalendarCells.filter((c) => c.kind === "day" && !c.isSunday && c.hasFocus).length;
  const selectedDateFocus = displayFocusByDate[workoutDateKey] || "";

  const focusPages = Math.max(1, Math.ceil(focusOptions.length / FOCUS_PER_PAGE));
  const focusPageItems = focusOptions.slice((focusPage - 1) * FOCUS_PER_PAGE, focusPage * FOCUS_PER_PAGE);

  useEffect(() => {
    if (focusPage > focusPages) setFocusPage(focusPages);
  }, [focusPage, focusPages]);

  const handleWorkoutDateChange = (value: string) => {
    const next = isoDate(value) || value;
    setWorkoutDate(next);
    setWorkoutCalendarOpen(true);
    onConfirmReview();
  };

  const shiftCalendarMonth = (delta: number) => {
    const pivot = new Date(dateParts.year, dateParts.monthIndex + delta, 1);
    const daysInTarget = new Date(pivot.getFullYear(), pivot.getMonth() + 1, 0).getDate();
    const day = Math.min(dateParts.day, daysInTarget);
    handleWorkoutDateChange(ptDateKeyFromParts(pivot.getFullYear(), pivot.getMonth(), day));
  };

  const selectFocusDraft = (focus: string) => {
    if (!canEdit) return;
    setFocusScheduleDraft({
      memberId: member.memberId,
      dateKey: workoutDateKey,
      focus: focus || null,
    });
  };

  const saveFocusSchedule = async () => {
    if (!focusScheduleDirty || !focusDraftApplies || focusScheduleSaving) return;
    setFocusScheduleSaving(true);
    const ok = await onSaveFocus(focusScheduleDraft?.focus || null, workoutDateKey);
    if (ok) setFocusScheduleDraft(null);
    setFocusScheduleSaving(false);
  };

  const clearFocusSchedule = async () => {
    if (!canEdit || focusScheduleSaving) return;
    const hasSaved = Boolean(savedFocusByDate[workoutDateKey]);
    const hasDraftSelection = focusDraftApplies && focusScheduleDraft?.focus;
    if (!hasSaved && !hasDraftSelection) return;
    if (
      !window.confirm(
        `Clear workout schedule for ${workoutDateKey}? This removes the saved focus for this date.`,
      )
    ) {
      return;
    }
    setFocusScheduleSaving(true);
    const ok = await onSaveFocus(null, workoutDateKey);
    if (ok) setFocusScheduleDraft(null);
    setFocusScheduleSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <h3 className="mb-2 text-sm font-semibold">Client Settings: Workout Plan</h3>
        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Client Name:</span>{" "}
            <span className="font-medium">{member.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Plan Type:</span>{" "}
            <span className="font-medium">Personal Training (PT) - Custom</span>
          </div>
          <div>
            <span className="text-muted-foreground">Payment Status:</span>{" "}
            <span className="font-medium">Active (Renewal: {formatDate(member.billingDate)})</span>
          </div>
          <div>
            <span className="text-muted-foreground">Primary Focus:</span>{" "}
            <span className="font-medium">{selectedDateFocus || "Not set"}</span>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "space-y-2",
          reviewPending &&
            "rounded-xl border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-700/50 dark:bg-amber-950/25",
        )}
      >
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="pt-workout-date-input"
              className={cn(
                "block min-h-5 leading-5",
                reviewPending && "text-amber-800 dark:text-amber-200",
              )}
            >
              Workout Date
              {reviewPending ? (
                <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  — Review
                </span>
              ) : null}
            </Label>
            <Input
              id="pt-workout-date-input"
              type="date"
              value={workoutDate}
              onChange={(e) => handleWorkoutDateChange(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-assigned-trainer" className="block min-h-5 leading-5">
              Assigned Trainer
            </Label>
            <Select
              id="pt-assigned-trainer"
              value={profile.trainerId || ""}
              onChange={(e) => onPersistTrainer(e.target.value)}
              disabled={!canEdit}
            >
              <option value="">Select trainer</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Calendar month follows Workout Date. Change it to jump the scheduler, then Save a focus.
        </p>
        {reviewPending ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300" role="status">
              You switched PT client. Confirm this workout date still applies to the new client.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 text-amber-800"
              onClick={onConfirmReview}
            >
              Use this date
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-semibold">Primary Focus Selection</div>
        <div className="text-xs text-muted-foreground">
          Select the focus for <span className="font-semibold text-foreground">{workoutDateKey}</span>{" "}
          (10 per page), then click Save. The calendar updates for that Workout Date.
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {focusPageItems.map((opt) => {
            const active = selectedDateFocus === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => selectFocusDraft(opt)}
                disabled={!canEdit || focusScheduleSaving}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
                    : "border-border bg-background hover:bg-accent",
                  (!canEdit || focusScheduleSaving) && "cursor-not-allowed opacity-60",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFocusPage((p) => Math.max(1, p - 1))}
            disabled={focusPage <= 1}
          >
            Prev
          </Button>
          <span className="font-medium text-foreground">
            Page {focusPage} of {focusPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFocusPage((p) => Math.min(focusPages, p + 1))}
            disabled={focusPage >= focusPages}
          >
            Next
          </Button>
          {canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveFocusSchedule()}
                disabled={!focusScheduleDirty || focusScheduleSaving}
              >
                {focusScheduleSaving ? "Saving…" : "Save"}
              </Button>
              {focusScheduleDirty && !focusScheduleSaving ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-rose-300 text-rose-700"
                onClick={() => void clearFocusSchedule()}
                disabled={
                  focusScheduleSaving ||
                  (!savedFocusForDate && !(focusDraftApplies && focusScheduleDraft?.focus))
                }
              >
                Clear for date
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "rounded-xl border border-border bg-card p-3",
          !workoutCalendarOpen && "ring-1 ring-emerald-200/60 dark:ring-emerald-800/40",
        )}
      >
        <button
          type="button"
          onClick={() => setWorkoutCalendarOpen((v) => !v)}
          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
          aria-expanded={workoutCalendarOpen}
        >
          <h4 className="text-sm font-semibold">
            Workout Scheduler & Calendar
            {!workoutCalendarOpen ? (
              <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                — expand to update calendar based on Workout Date
              </span>
            ) : null}
          </h4>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Total PT days this month:{" "}
              <span className="font-semibold text-foreground">{ptDaysDone}</span>
            </span>
            <span className="font-semibold">{workoutCalendarOpen ? "Hide" : "Show"}</span>
          </div>
        </button>
        {workoutCalendarOpen ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => shiftCalendarMonth(-1)}>
                  ← Prev month
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => shiftCalendarMonth(1)}>
                  Next month →
                </Button>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {MONTH_LABELS[dateParts.monthIndex]} {dateParts.year}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tap a day to set Workout Date, choose a focus above, then Save
              {canEdit ? "" : " (view only — ask owner for Edit PT Workout)"}. Green = scheduled · Rose =
              open.
            </p>
            <div className="mb-2 mt-2 grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="font-semibold">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthCalendarCells.map((entry) =>
                entry.kind === "pad" ? (
                  <div
                    key={entry.key}
                    className="min-h-12 rounded-lg border border-transparent px-2 py-2"
                    aria-hidden
                  />
                ) : (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => handleWorkoutDateChange(entry.key)}
                    className={cn(
                      "min-h-12 rounded-lg border px-2 py-2 text-xs",
                      entry.isSunday
                        ? "border-border bg-muted text-muted-foreground"
                        : entry.hasFocus
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30"
                          : "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30",
                      workoutDateKey === entry.key && "ring-2 ring-sky-500",
                    )}
                    title={
                      entry.focus ? `${entry.key}: ${entry.focus}` : `${entry.key}: No focus assigned`
                    }
                  >
                    <div className="font-semibold">{entry.day}</div>
                    <div className="mt-1 truncate">{entry.focus || (entry.isSunday ? "Sun" : "—")}</div>
                  </button>
                ),
              )}
            </div>
          </>
        ) : null}
      </div>

      <div>
        <Label>PT Workout Notes</Label>
        <Textarea
          rows={4}
          className="mt-1"
          value={workoutNotesDraft}
          onChange={(e) => onWorkoutNotesChange(e.target.value)}
          disabled={!canEdit || sectionSaving.workoutNotes}
        />
        {canEdit ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!workoutNotesDirty || sectionSaving.workoutNotes}
              onClick={onSaveNotes}
            >
              {sectionSaving.workoutNotes ? "Saving…" : "Save"}
            </Button>
            {workoutNotesDirty && !sectionSaving.workoutNotes ? (
              <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
