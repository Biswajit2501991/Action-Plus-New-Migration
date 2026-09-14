"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { visitorsApi, type VisitorStaffComment } from "@/services/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  visitorId: string;
  visitorName: string;
  converted: boolean;
  canWrite: boolean;
  isOwner: boolean;
  comments: VisitorStaffComment[];
  onChanged: () => void;
};

export function VisitorStaffCommentsControl({
  visitorId,
  visitorName,
  converted,
  canWrite,
  isOwner,
  comments,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const canAdd = canWrite && (!converted || isOwner);
  const count = comments.length;

  const sorted = useMemo(
    () =>
      [...comments].sort((a, b) => {
        const aMs = new Date(String(a.createdAt || 0)).getTime() || 0;
        const bMs = new Date(String(b.createdAt || 0)).getTime() || 0;
        return bMs - aMs;
      }),
    [comments],
  );

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  const save = async () => {
    const body = draft.trim();
    if (!body) {
      toast.error("Write a staff comment first.");
      return;
    }
    setSaving(true);
    try {
      await visitorsApi.addStaffComment(visitorId, body);
      toast.success("Staff comment added");
      setDraft("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save comment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {canAdd ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-border dark:bg-card dark:text-slate-200"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <MessageSquarePlus className="h-3 w-3" />
            Add Staff comment
          </button>
        ) : null}
        {count > 0 ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
              converted
                ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-border dark:bg-muted dark:text-slate-300"
                : "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <MessagesSquare className="h-3 w-3" />
            {converted ? `Comments (${count}) · view` : `Comments (${count})`}
          </button>
        ) : null}
      </div>

      <ClassicalModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Staff comments · ${visitorName}`}
        description={
          converted
            ? isOwner
              ? "Converted visitor — comments are read-only history. Owner can still add."
              : "Converted visitor — comments are read-only for staff."
            : "Append-only notes for follow-up. Past comments cannot be edited."
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {canAdd ? (
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Add comment"}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-4">
          {canAdd ? (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                New comment
              </label>
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={2000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Call notes, interest level, objections…"
              />
            </div>
          ) : null}

          {!sorted.length ? (
            <p className="text-sm text-slate-500">No staff comments yet.</p>
          ) : (
            <ul className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {sorted.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-border dark:bg-muted/40"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {c.createdByName || c.createdBy || "Staff"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatDate(String(c.createdAt || ""))}
                    </p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ClassicalModal>
    </>
  );
}
