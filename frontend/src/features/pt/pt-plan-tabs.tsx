"use client";

import { useState } from "react";
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
  actorName,
  onAddMessage,
}: {
  profile: PtClientProfile;
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  actorName: string;
  onAddMessage: (text: string) => Promise<boolean>;
}) {
  const [chatDraft, setChatDraft] = useState("");

  const addChatMessage = async () => {
    if (!chatDraft.trim() || sectionSaving.chat) return;
    const ok = await onAddMessage(chatDraft.trim());
    if (ok) setChatDraft("");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          placeholder="Enter trainer update / member concern..."
          disabled={sectionSaving.chat}
          className="flex-1"
        />
        <Button
          onClick={() => void addChatMessage()}
          disabled={!canEdit || !chatDraft.trim() || sectionSaving.chat}
        >
          {sectionSaving.chat ? "Saving…" : "Save Note"}
        </Button>
      </div>
      <div className="space-y-2">
        {(profile.chat || []).slice(0, 10).map((msg) => (
          <div key={msg.id} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="font-medium">{msg.by || actorName}</div>
            <div>{msg.text}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateTimeTz(msg.ts, "IST")} <span className="text-[10px] uppercase">IST</span>
            </div>
          </div>
        ))}
        {!profile.chat?.length ? (
          <div className="text-sm text-muted-foreground">No trainer notes yet.</div>
        ) : null}
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
  profile,
  canEdit,
  sectionSaving,
  onAddWeight,
}: {
  profile: PtClientProfile;
  canEdit: boolean;
  sectionSaving: Record<string, boolean>;
  onAddWeight: (entry: { date: string; weight: number }) => Promise<boolean>;
}) {
  const [weightDraft, setWeightDraft] = useState({ date: isoDate(new Date()), weight: "" });

  const weightLogs = (profile.weightLogs || [])
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const firstWeight = weightLogs[0]?.weight ?? null;
  const latestWeight = weightLogs[weightLogs.length - 1]?.weight ?? null;
  const weightDelta =
    firstWeight != null && latestWeight != null ? latestWeight - firstWeight : null;

  const addWeightLog = async () => {
    if (!weightDraft.date || !weightDraft.weight.trim() || sectionSaving.weight) return;
    const val = Number(weightDraft.weight);
    if (Number.isNaN(val) || val <= 0) return;
    const ok = await onAddWeight({ date: weightDraft.date, weight: val });
    if (ok) setWeightDraft((v) => ({ ...v, weight: "" }));
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
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label>Weight (kg)</Label>
          <Input
            className="mt-1"
            value={weightDraft.weight}
            onChange={(e) => setWeightDraft((v) => ({ ...v, weight: e.target.value }))}
            disabled={!canEdit}
          />
        </div>
        <div className="md:self-end">
          <Button className="w-full" onClick={() => void addWeightLog()} disabled={!canEdit || sectionSaving.weight}>
            {sectionSaving.weight ? "Saving…" : "Add Weight"}
          </Button>
        </div>
      </div>
      <div className="text-sm">
        Current:{" "}
        <span className="font-semibold">{latestWeight == null ? "NA" : `${latestWeight} kg`}</span> • Change:{" "}
        <span className="font-semibold">
          {weightDelta == null ? "NA" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg`}
        </span>
      </div>
      <div className="space-y-1">
        {weightLogs
          .slice()
          .reverse()
          .map((w) => (
            <div key={w.id} className="rounded-lg border border-border px-3 py-2 text-sm">
              {formatDate(w.date)}: <span className="font-medium">{w.weight} kg</span>
            </div>
          ))}
        {!weightLogs.length ? (
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
