"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  ptDietDraftDirty,
  ptWorkoutPlanDraftFromProfile,
} from "@/lib/domain/pt-drafts";
import { fileToAttachmentDataUrl, MAX_IMAGE_FILE_BYTES } from "@/lib/image-upload";
import { formatDate } from "@/lib/utils";
import { formatDateTimeTz } from "@/lib/domain/member-actions";
import { isoDate } from "@/lib/domain/member-dates";
import { apiFetch } from "@/services/api/client";
import type { PtClientProfile, PtDietDraft } from "@/types/pt";

export function PtWorkoutPlanTab({
  profile,
  canEdit,
  sectionSaving,
  workoutPlanDraft,
  onWorkoutPlanChange,
  onSave,
}: {
  profile: PtClientProfile;
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  workoutPlanDraft: string;
  onWorkoutPlanChange: (v: string) => void;
  onSave: () => void;
}) {
  const workoutPlanDirty = workoutPlanDraft !== ptWorkoutPlanDraftFromProfile(profile);

  return (
    <div>
      <Label>Weekly Workout Plan</Label>
      <Textarea
        rows={6}
        className="mt-1"
        value={workoutPlanDraft}
        onChange={(e) => onWorkoutPlanChange(e.target.value)}
        disabled={!canEdit || sectionSaving.workoutPlan}
        placeholder="Day-wise split, reps, sets, progressive overload notes."
      />
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!workoutPlanDirty || sectionSaving.workoutPlan}
            onClick={onSave}
          >
            {sectionSaving.workoutPlan ? "Saving…" : "Save"}
          </Button>
          {workoutPlanDirty && !sectionSaving.workoutPlan ? (
            <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PtDietPlanTab({
  profile,
  canEditPlan,
  canUploadDocs,
  sectionSaving,
  dietDraft,
  onDietDraftChange,
  onSaveDiet,
  onAddAttachments,
  onRemoveAttachment,
}: {
  profile: PtClientProfile;
  canEditPlan: boolean;
  canUploadDocs: boolean;
  sectionSaving: Record<string, boolean>;
  dietDraft: PtDietDraft;
  onDietDraftChange: (draft: PtDietDraft) => void;
  onSaveDiet: () => void;
  onAddAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
}) {
  const dietDirty = ptDietDraftDirty(dietDraft, profile);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <Label>Calories / day</Label>
        <Input
          className="mt-1"
          value={dietDraft.calories}
          onChange={(e) => onDietDraftChange({ ...dietDraft, calories: e.target.value })}
          disabled={!canEditPlan || sectionSaving.dietPlan}
        />
      </div>
      <div>
        <Label>Protein (g)</Label>
        <Input
          className="mt-1"
          value={dietDraft.protein}
          onChange={(e) => onDietDraftChange({ ...dietDraft, protein: e.target.value })}
          disabled={!canEditPlan || sectionSaving.dietPlan}
        />
      </div>
      <div>
        <Label>Water (L)</Label>
        <Input
          className="mt-1"
          value={dietDraft.water}
          onChange={(e) => onDietDraftChange({ ...dietDraft, water: e.target.value })}
          disabled={!canEditPlan || sectionSaving.dietPlan}
        />
      </div>
      <div className="md:col-span-3">
        <Label>Diet Plan Details</Label>
        <Textarea
          rows={5}
          className="mt-1"
          value={dietDraft.dietPlan}
          onChange={(e) => onDietDraftChange({ ...dietDraft, dietPlan: e.target.value })}
          disabled={!canEditPlan || sectionSaving.dietPlan}
        />
      </div>
      {canEditPlan ? (
        <div className="flex flex-wrap items-center gap-2 md:col-span-3">
          <Button type="button" disabled={!dietDirty || sectionSaving.dietPlan} onClick={onSaveDiet}>
            {sectionSaving.dietPlan ? "Saving…" : "Save"}
          </Button>
          {dietDirty && !sectionSaving.dietPlan ? (
            <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 md:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Diet Plan Documents</div>
            <div className="text-xs text-muted-foreground">
              Upload paper diet-plan photos/files (max {MAX_IMAGE_FILE_BYTES / (1024 * 1024)}MB each).
            </div>
          </div>
          {canUploadDocs ? (
            <label className="cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
              <input
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  onAddAttachments(e.target.files);
                  e.target.value = "";
                }}
              />
              Add Document
            </label>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(profile.dietAttachments || []).map((doc) => (
            <div key={doc.id} className="space-y-2 rounded-lg border border-border bg-background p-2">
              {String(doc.mime || "").startsWith("image/") ? (
                <img
                  src={doc.dataUrl}
                  alt={doc.name || "Diet attachment"}
                  className="h-28 w-full rounded border border-border object-cover"
                />
              ) : (
                <div className="flex h-28 w-full items-center justify-center rounded border border-border bg-muted text-xs text-muted-foreground">
                  Document
                </div>
              )}
              <div className="truncate text-xs" title={doc.name}>
                {doc.name}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={doc.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700"
                >
                  Open
                </a>
                {canUploadDocs ? (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(doc.id)}
                    className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!profile.dietAttachments?.length ? (
            <div className="text-sm text-muted-foreground">No documents uploaded yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PtChatTab({
  profile,
  canEdit,
  sectionSaving,
  onAddMessage,
  hasNewMemberChat = false,
}: {
  profile: PtClientProfile;
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  onAddMessage: (text: string) => Promise<boolean>;
  hasNewMemberChat?: boolean;
}) {
  const [chatDraft, setChatDraft] = useState("");

  const addChatMessage = async () => {
    if (!chatDraft.trim() || sectionSaving.chat) return;
    const ok = await onAddMessage(chatDraft.trim());
    if (ok) setChatDraft("");
  };

  const messages = [...(profile.chat || [])].reverse();

  return (
    <div className="space-y-3">
      {hasNewMemberChat ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          New message from member — reply below.
        </div>
      ) : null}
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
        {messages.map((msg) => {
          const fromMember = msg.from === "member";
          return (
            <div
              key={msg.id}
              className={`rounded-xl border px-3 py-2 text-sm ${
                fromMember
                  ? "border-amber-300/70 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                  : "border-border bg-background"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {fromMember ? "Member" : "Trainer"}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap">{msg.text}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDateTimeTz(msg.ts, "IST")} <span className="text-[10px] uppercase">IST</span>
              </div>
            </div>
          );
        })}
        {!messages.length ? (
          <div className="text-sm text-muted-foreground">
            No chat yet. Member messages from the portal appear here.
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          placeholder="Reply to member…"
          disabled={sectionSaving.chat}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void addChatMessage();
            }
          }}
        />
        <Button
          onClick={() => void addChatMessage()}
          disabled={!canEdit || !chatDraft.trim() || sectionSaving.chat}
        >
          {sectionSaving.chat ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export function PtSessionsTab({
  profile,
  canEdit,
  sectionSaving,
  onAddSession,
}: {
  profile: PtClientProfile;
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  onAddSession: (session: { date: string; time: string; status: string; note: string }) => Promise<boolean>;
}) {
  const [sessionDraft, setSessionDraft] = useState({
    date: isoDate(new Date()),
    time: "07:00",
    status: "Scheduled",
    note: "",
  });

  const addSession = async () => {
    if (!sessionDraft.date || sectionSaving.session) return;
    const ok = await onAddSession(sessionDraft);
    if (ok) setSessionDraft({ date: isoDate(new Date()), time: "07:00", status: "Scheduled", note: "" });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            className="mt-1"
            value={sessionDraft.date}
            onChange={(e) => setSessionDraft((v) => ({ ...v, date: e.target.value }))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label>Time</Label>
          <Input
            type="time"
            className="mt-1"
            value={sessionDraft.time}
            onChange={(e) => setSessionDraft((v) => ({ ...v, time: e.target.value }))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label>Status</Label>
          <select
            className="mt-1 flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={sessionDraft.status}
            onChange={(e) => setSessionDraft((v) => ({ ...v, status: e.target.value }))}
            disabled={!canEdit}
          >
            <option>Scheduled</option>
            <option>Completed</option>
            <option>Missed</option>
          </select>
        </div>
        <div className="md:self-end">
          <Button className="w-full" onClick={() => void addSession()} disabled={!canEdit || sectionSaving.session}>
            {sectionSaving.session ? "Saving…" : "Add Session"}
          </Button>
        </div>
        <div className="md:col-span-4">
          <Input
            value={sessionDraft.note}
            onChange={(e) => setSessionDraft((v) => ({ ...v, note: e.target.value }))}
            disabled={!canEdit}
            placeholder="Session note"
          />
        </div>
      </div>
      <div className="space-y-2">
        {(profile.sessions || []).slice(0, 8).map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              {formatDate(s.date)} • {s.time || "--"} • <span className="font-medium">{s.status}</span>
            </div>
            <div className="text-muted-foreground">{s.note || "-"}</div>
          </div>
        ))}
        {!profile.sessions?.length ? (
          <div className="text-sm text-muted-foreground">No sessions added.</div>
        ) : null}
      </div>
    </div>
  );
}

export function PtWeightTab({
  memberId,
  canEdit,
}: {
  memberId: string;
  canEdit: boolean;
}) {
  const [weightDraft, setWeightDraft] = useState({ date: isoDate(new Date()), weight: "" });
  const [logs, setLogs] = useState<
    Array<{ id: string; date: string; weightKg: number | null; recordedBy?: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fromStartKg, setFromStartKg] = useState<number | null>(null);
  const [currentKg, setCurrentKg] = useState<number | null>(null);

  const load = useCallback(async () => {
    const key = String(memberId || "").trim();
    if (!key) {
      setLogs([]);
      setCurrentKg(null);
      setFromStartKg(null);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        ok?: boolean;
        logs?: Array<{ id: string; date: string; weightKg: number | null; recordedBy?: string }>;
        currentKg?: number | null;
        fromStartKg?: number | null;
      }>(`/member-weight-logs/${encodeURIComponent(key)}`);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setCurrentKg(data.currentKg ?? null);
      setFromStartKg(data.fromStartKg ?? null);
    } catch {
      setLogs([]);
      setCurrentKg(null);
      setFromStartKg(null);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addWeightLog = async () => {
    if (!weightDraft.date || !weightDraft.weight.trim() || saving || !canEdit) return;
    const val = Number(weightDraft.weight);
    if (Number.isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await apiFetch(`/member-weight-logs/${encodeURIComponent(memberId)}`, {
        method: "POST",
        body: JSON.stringify({ date: weightDraft.date, weightKg: val }),
      });
      setWeightDraft((v) => ({ ...v, weight: "" }));
      toast.success("Weight saved successfully");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save weight");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            className="mt-1"
            value={weightDraft.date}
            onChange={(e) => setWeightDraft((v) => ({ ...v, date: e.target.value }))}
            disabled={!canEdit || saving}
          />
        </div>
        <div>
          <Label>Weight (kg)</Label>
          <Input
            className="mt-1"
            value={weightDraft.weight}
            onChange={(e) => setWeightDraft((v) => ({ ...v, weight: e.target.value }))}
            disabled={!canEdit || saving}
          />
        </div>
        <div className="md:self-end">
          <Button
            className="w-full"
            onClick={() => void addWeightLog()}
            disabled={!canEdit || saving}
          >
            {saving ? "Saving…" : "Add Weight"}
          </Button>
        </div>
      </div>
      <div className="text-sm">
        Current:{" "}
        <span className="font-semibold">{currentKg == null ? "NA" : `${currentKg} kg`}</span> • Change
        from start:{" "}
        <span className="font-semibold">
          {fromStartKg == null
            ? "NA"
            : `${fromStartKg > 0 ? "+" : ""}${fromStartKg.toFixed(1)} kg`}
        </span>
      </div>
      <div className="space-y-1">
        {loading && !logs.length ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : null}
        {logs.map((w) => (
          <div key={w.id} className="rounded-lg border border-border px-3 py-2 text-sm">
            {formatDate(w.date)}:{" "}
            <span className="font-medium">{w.weightKg != null ? `${w.weightKg} kg` : "—"}</span>
            {w.recordedBy ? (
              <span className="ml-2 text-xs text-muted-foreground">({w.recordedBy})</span>
            ) : null}
          </div>
        ))}
        {!loading && !logs.length ? (
          <div className="text-sm text-muted-foreground">No weight logs yet.</div>
        ) : null}
      </div>
    </div>
  );
}

export async function buildDietAttachmentsFromFiles(
  files: FileList | null,
  existing: PtClientProfile["dietAttachments"] = [],
) {
  if (!files?.length) return existing || [];
  const valid = Array.from(files).filter((file) => file.size <= MAX_IMAGE_FILE_BYTES);
  const entries = await Promise.all(
    valid.map(async (file) => {
      const dataUrl = await fileToAttachmentDataUrl(file);
      if (!dataUrl) return null;
      return {
        id: crypto.randomUUID(),
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
    }),
  );
  const added = entries.filter((e): e is NonNullable<typeof e> => e != null);
  return [...(existing || []), ...added].slice(-60);
}
