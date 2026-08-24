"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Play, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { cn } from "@/lib/utils";
import {
  MAX_WORKOUT_PLAN_VIDEO_BYTES,
  WORKOUT_PLAN_EXERCISES,
} from "@/lib/workout-plan-exercises";

type MediaRow = {
  exerciseKey: string;
  name: string;
  mp4Url: string | null;
  hasVideo: boolean;
};

export function WorkoutPlanVideosPanel() {
  const [rows, setRows] = useState<MediaRow[]>(
    WORKOUT_PLAN_EXERCISES.map((ex) => ({
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      mp4Url: null,
      hasVideo: false,
    })),
  );
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaRow | null>(null);

  const reload = useCallback(async () => {
    const data = await apiFetch<{ ok?: boolean; exercises?: MediaRow[] }>(
      "/portal-workout-exercise-media",
    );
    if (Array.isArray(data.exercises) && data.exercises.length) {
      setRows(data.exercises);
    }
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      /* catalog still shows even if table/API is not ready */
    });
  }, [reload]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || row.exerciseKey.toLowerCase().includes(q),
    );
  }, [query, rows]);

  async function upload(row: MediaRow, file: File) {
    if (file.size > MAX_WORKOUT_PLAN_VIDEO_BYTES) {
      toast.error("Video must be 50 MB or smaller.");
      return;
    }
    if (file.type && file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      toast.error("Upload an MP4 file.");
      return;
    }
    setBusyKey(row.exerciseKey);
    try {
      let data: { ok?: boolean; exercise?: MediaRow } | null = null;
      let uploadedDirect = false;
      try {
        const signed = await apiFetch<{
          uploadUrl?: string;
          token?: string;
          storagePath?: string;
        }>("/portal-workout-exercise-media", {
          method: "POST",
          body: JSON.stringify({
            action: "sign",
            exerciseKey: row.exerciseKey,
            fileSize: file.size,
          }),
        });
        if (!signed.uploadUrl || !signed.storagePath) throw new Error("Could not start upload");
        const put = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "video/mp4",
            ...(signed.token ? { Authorization: `Bearer ${signed.token}` } : {}),
          },
          body: file,
        });
        if (!put.ok) {
          const detail = await put.text().catch(() => "");
          throw new Error(detail || `Storage upload failed (${put.status})`);
        }
        uploadedDirect = true;
        data = await apiFetch<{ ok?: boolean; exercise?: MediaRow }>(
          "/portal-workout-exercise-media",
          {
            method: "POST",
            body: JSON.stringify({
              action: "commit",
              exerciseKey: row.exerciseKey,
              storagePath: signed.storagePath,
            }),
          },
        );
      } catch (directErr) {
        if (uploadedDirect) throw directErr;
        const body = new FormData();
        body.set("exerciseKey", row.exerciseKey);
        body.set("file", file);
        data = await apiFetch<{ ok?: boolean; exercise?: MediaRow }>(
          "/portal-workout-exercise-media",
          { method: "POST", body },
        );
      }
      if (data?.exercise) {
        setRows((prev) =>
          prev.map((item) => (item.exerciseKey === row.exerciseKey ? data!.exercise! : item)),
        );
      }
      toast.success(`${row.name} video saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(row: MediaRow) {
    if (!window.confirm(`Remove the video for ${row.name}?`)) return;
    setBusyKey(row.exerciseKey);
    try {
      await apiFetch(`/portal-workout-exercise-media?exerciseKey=${encodeURIComponent(row.exerciseKey)}`, {
        method: "DELETE",
      });
      setRows((prev) =>
        prev.map((item) =>
          item.exerciseKey === row.exerciseKey
            ? { ...item, mp4Url: null, hasVideo: false }
            : item,
        ),
      );
      toast.success(`${row.name} video removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove video");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Exercise videos</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          One MP4 per exercise (max 50 MB). The same Goblet Squat video plays in Beginner,
          Intermediate, and Advanced. Members open it in a popup on their phone. Missing videos
          never block Timer or Done.
        </p>
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercise…"
      />
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {visible.map((row) => {
          const busy = busyKey === row.exerciseKey;
          return (
            <div
              key={row.exerciseKey}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.hasVideo ? "Video saved" : "No video yet"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {row.hasVideo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="gap-1"
                    onClick={() => setPreview(row)}
                  >
                    <Play className="h-3.5 w-3.5" /> Play
                  </Button>
                ) : null}
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(row, file);
                    }}
                  />
                  <span
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800",
                      busy && "pointer-events-none opacity-45",
                    )}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {busy ? "Saving…" : row.hasVideo ? "Replace" : "Upload MP4"}
                  </span>
                </label>
                {row.hasVideo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${row.name} video`}
                    onClick={() => void remove(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {preview?.mp4Url ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-background p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{preview.name}</p>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label="Close video"
                onClick={() => setPreview(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <video
              src={preview.mp4Url}
              controls
              playsInline
              autoPlay
              className="max-h-[70vh] w-full rounded-xl bg-black"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
