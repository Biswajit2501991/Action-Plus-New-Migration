"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Music2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 500 * 1024 * 1024;

type MusicRow = {
  title: string;
  mp4Url: string | null;
  hasMusic: boolean;
  fileSizeBytes?: number | null;
  updatedAt?: string | null;
};

function formatBytes(n: number | null | undefined) {
  const v = Number(n) || 0;
  if (v <= 0) return "";
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkoutPlanMusicPanel() {
  const [music, setMusic] = useState<MusicRow | null>(null);
  const [title, setTitle] = useState("Gym music");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const data = await apiFetch<{ ok?: boolean; music?: MusicRow | null }>(
      "/portal-workout-music",
    );
    setMusic(data.music || null);
    if (data.music?.title) setTitle(data.music.title);
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      /* panel still usable if table not ready */
    });
  }, [reload]);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("Music file must be 500 MB or smaller.");
      return;
    }
    const lower = file.name.toLowerCase();
    if (
      file.type &&
      file.type !== "video/mp4" &&
      file.type !== "audio/mp4" &&
      file.type !== "audio/mpeg" &&
      !lower.endsWith(".mp4") &&
      !lower.endsWith(".m4a")
    ) {
      toast.error("Upload an MP4 (or M4A) music file.");
      return;
    }
    setBusy(true);
    try {
      const signed = await apiFetch<{
        uploadUrl?: string;
        token?: string;
        storagePath?: string;
        message?: string;
      }>("/portal-workout-music", {
        method: "POST",
        body: JSON.stringify({
          action: "sign",
          fileSize: file.size,
          title: title.trim() || "Gym music",
        }),
      });
      if (!signed.uploadUrl || !signed.storagePath) {
        throw new Error(signed.message || "Could not start upload");
      }
      const putHeaders: Record<string, string> = {
        "Content-Type": file.type || "video/mp4",
        "x-upsert": "true",
      };
      if (signed.token) putHeaders.Authorization = `Bearer ${signed.token}`;
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: putHeaders,
        body: file,
      });
      if (!put.ok) {
        const detail = await put.text().catch(() => "");
        throw new Error(detail || `Storage upload failed (${put.status})`);
      }
      const data = await apiFetch<{ ok?: boolean; music?: MusicRow }>(
        "/portal-workout-music",
        {
          method: "POST",
          body: JSON.stringify({
            action: "commit",
            storagePath: signed.storagePath,
            fileSize: file.size,
            title: title.trim() || "Gym music",
          }),
        },
      );
      setMusic(data.music || null);
      toast.success("Music uploaded — members can play it from Workout Plan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!music?.hasMusic) {
      toast.error("Upload a music file first");
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<{ ok?: boolean; music?: MusicRow }>(
        "/portal-workout-music",
        {
          method: "POST",
          body: JSON.stringify({
            action: "title",
            title: title.trim() || "Gym music",
          }),
        },
      );
      setMusic(data.music || null);
      toast.success("Title saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save title");
    } finally {
      setBusy(false);
    }
  }

  async function removeMusic() {
    if (!window.confirm("Remove gym music from Member Portal Workout Plan?")) return;
    setBusy(true);
    try {
      await apiFetch("/portal-workout-music", { method: "DELETE" });
      setMusic(null);
      toast.success("Music removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Music Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload one gym-wide MP4 music track (max 500 MB). Members with Workout Plan see a music
          icon under Change program and can play it in a popup. Many members can stream at once.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <label htmlFor="portal-music-title" className="text-sm font-medium text-foreground">
            Track title
          </label>
          <Input
            id="portal-music-title"
            className="mt-1"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Gym music"
          />
        </div>
        <Button type="button" variant="outline" disabled={busy || !music?.hasMusic} onClick={() => void saveTitle()}>
          Save title
        </Button>
        <label className="inline-flex">
          <input
            type="file"
            accept="video/mp4,audio/mp4,audio/mpeg,.mp4,.m4a"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <span
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-foreground",
              busy && "pointer-events-none opacity-45",
            )}
          >
            <Upload className="h-4 w-4" />
            {busy ? "Uploading…" : music?.hasMusic ? "Replace MP4" : "Upload MP4"}
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-white/10">
        {music?.hasMusic ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Music2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{music.title}</p>
                <p className="text-xs text-muted-foreground">
                  Ready for Member Portal
                  {music.fileSizeBytes ? ` · ${formatBytes(music.fileSizeBytes)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {music.mp4Url ? (
                <a
                  href={music.mp4Url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-sky-700 underline dark:text-sky-300"
                >
                  Open file
                </a>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                className="text-rose-700"
                onClick={() => void removeMusic()}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">No music uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
