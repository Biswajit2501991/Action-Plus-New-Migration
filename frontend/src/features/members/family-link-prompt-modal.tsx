"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Member } from "@/types";

export type FamilyLinkPromptState = {
  mode: "add" | "edit";
  draft: Member;
  matches: Member[];
  selectedPrimaryId: string;
};

export function FamilyLinkPromptModal({
  prompt,
  onChangePrimary,
  onCancel,
  onConfirm,
  confirming,
}: {
  prompt: FamilyLinkPromptState;
  onChangePrimary: (memberId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const [linkSearch, setLinkSearch] = useState("");
  const draftId = String(prompt.draft.memberId || "").trim();
  const q = linkSearch.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return prompt.matches;
    return prompt.matches.filter((m) =>
      [m.name, m.memberId, m.mobile].some((f) =>
        String(f || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [prompt.matches, q]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-background shadow-xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-indigo-800 sm:text-lg dark:text-indigo-300">
            Link family (shared mobile)
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm sm:p-5">
          <p className="text-slate-700 dark:text-slate-200">
            This mobile number is already registered for another member. Link them as one family
            unit and choose who is the <span className="font-semibold">primary</span> contact for
            this number, or cancel to keep your changes unsaved.
          </p>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Search matches
            </label>
            <Input
              type="search"
              className="mt-1"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Name, ID, or phone…"
            />
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Primary contact
          </div>
          <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map((m) => (
              <label
                key={m.memberId}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-100 dark:border-border dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              >
                <input
                  type="radio"
                  name="family-primary"
                  className="mt-1"
                  checked={String(prompt.selectedPrimaryId) === String(m.memberId)}
                  onChange={() => onChangePrimary(String(m.memberId))}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    {m.name || m.memberId}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {m.memberId} · {m.mobile || "—"} · {m.status || "—"}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 hover:bg-indigo-100/80 dark:border-indigo-900 dark:bg-indigo-950/40">
              <input
                type="radio"
                name="family-primary"
                className="mt-1"
                checked={String(prompt.selectedPrimaryId) === draftId}
                onChange={() => onChangePrimary(draftId)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                  {prompt.mode === "add" ? "New member is primary" : "This member is primary"}
                </span>
                <span className="block text-xs text-indigo-800/90 dark:text-indigo-300/90">
                  {prompt.draft.name || draftId}
                </span>
              </span>
            </label>

            {filtered.length === 0 && prompt.matches.length > 0 ? (
              <div className="text-xs text-amber-700">
                No matches for this search — clear the filter to see everyone on this number.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t px-4 py-4 sm:flex-row sm:px-5">
          <Button type="button" variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? "Linking…" : "Link and save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
