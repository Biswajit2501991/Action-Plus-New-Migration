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

const LATE_NOTE_CATEGORIES = [
  { value: "traffic", label: "Traffic" },
  { value: "rain", label: "Rain" },
  { value: "medical", label: "Medical" },
  { value: "family", label: "Family" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
] as const;

function visibleSectionTabs(user: AuthUser | null | undefined) {
  return SECTION_ORDER.filter((section) => canAccessSection(user, section)).map((section) => {
    const item = NAV_ITEMS.find((n) => n.section === section)!;
    return item;
  });
}

export function AppSectionTabs() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [lateOpen, setLateOpen] = useState(false);
  const [category, setCategory] = useState<string>("traffic");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const tabs = useMemo(() => visibleSectionTabs(user), [user]);

  const canLateNote = Boolean(user) && hasAccess(user, "attendance", "submitOwnLateNote");

  const submitLateNote = async () => {
    if (!note.trim()) {
      toast.error("Please enter a short note");
      return;
    }
    setSaving(true);
    try {
      await attendanceApi.addNote({
        noteCategory: category,
        note: note.trim(),
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
      <div className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
          {canLateNote ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              onClick={() => setLateOpen(true)}
            >
              Add Late Note
            </Button>
          ) : null}
        </div>
      </div>

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
                {LATE_NOTE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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
                maxLength={280}
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
