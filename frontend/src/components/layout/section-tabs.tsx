"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { NAV_ITEMS, SECTION_ORDER } from "@/lib/nav";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { attendanceApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types";
import {
  ATTENDANCE_NOTE_CATEGORIES,
  ATTENDANCE_NOTE_CATEGORY_LABELS,
  ATTENDANCE_NOTE_MAX_LENGTH,
  isAttendanceNotesEnabled,
  validateAttendanceNotePayload,
} from "@/lib/domain/attendance";
import { useSettings } from "@/hooks/use-data";
import { localTodayCalendarKey } from "@/lib/domain/billing";

function visibleSectionTabs(user: AuthUser | null | undefined) {
  return SECTION_ORDER.filter((section) => canAccessSection(user, section)).map((section) => {
    const item = NAV_ITEMS.find((n) => n.section === section)!;
    return item;
  });
}

export function AppSectionTabs() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { data: settings } = useSettings();
  const [lateOpen, setLateOpen] = useState(false);
  const [category, setCategory] = useState<string>("traffic");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const tabs = useMemo(() => visibleSectionTabs(user), [user]);

  const notesEnabled = isAttendanceNotesEnabled(settings as Record<string, unknown>);
  const canLateNote =
    Boolean(user) && notesEnabled && hasAccess(user, "attendance", "submitOwnLateNote");

  const submitLateNote = async () => {
    try {
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
      setLateOpen(false);
      setNote("");
      setCategory("traffic");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save late note");
    } finally {
      setSaving(false);
    }
  };

  if (!tabs.length) return null;

  return (
    <>
      <nav
        aria-label="Sections"
        className="overflow-hidden rounded-2xl border border-black/[0.06] bg-gradient-to-b from-white/90 to-slate-50/80 p-1.5 shadow-[0_1px_0_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/[0.07] dark:from-white/[0.05] dark:to-slate-950/80 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_16px_40px_-24px_rgba(0,0,0,0.8)]"
      >
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium tracking-tight transition-all duration-200",
                  active
                    ? "bg-slate-900 text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.65)] dark:bg-teal-400 dark:text-slate-950 dark:shadow-[0_10px_24px_-12px_rgba(45,212,191,0.55)]"
                    : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-opacity",
                    active ? "opacity-95" : "opacity-55 group-hover:opacity-80",
                  )}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span>{tab.label}</span>
              </Link>
            );
          })}
          {canLateNote ? (
            <button
              type="button"
              onClick={() => setLateOpen(true)}
              className="ml-0.5 inline-flex h-9 shrink-0 items-center rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-amber-200 dark:hover:bg-amber-950/55"
            >
              Add Late Note
            </button>
          ) : null}
        </div>
      </nav>

      {lateOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Late arrival note</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a short reason for your manager (stored 60 days).
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setLateOpen(false)}>
                Close
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void submitLateNote()} disabled={saving}>
                {saving ? "Saving…" : "Save note"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
