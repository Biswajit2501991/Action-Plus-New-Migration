"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { cn } from "@/lib/utils";

type PreviewResponse = {
  ok?: boolean;
  recipients?: number;
  cooldownRemainingMs?: number;
  canBroadcast?: boolean;
  message?: string;
  error?: string;
};

type BroadcastResponse = {
  ok?: boolean;
  recipients?: number;
  membersSent?: number;
  membersFailed?: number;
  pushSent?: number;
  pushFailed?: number;
  message?: string;
  error?: string;
};

type BroadcastJob = {
  id: string;
  title: string;
  body: string;
  url?: string;
  scheduledAt: string;
  status: string;
  createdAt?: string;
  recipientsAtSend?: number | null;
  error?: string | null;
};

const TEMPLATES: { id: string; label: string; title: string; body: string }[] = [
  {
    id: "portal-access",
    label: "Enable Member Portal",
    title: "Enable your Member Portal access",
    body: "Open the Member Portal on your phone to view payments, attendance, and workout updates. Enable notifications so you never miss a reminder from the gym.",
  },
  {
    id: "gym-update",
    label: "Gym update",
    title: "Gym update",
    body: "We have an important update for members. Please check the Member Portal for details.",
  },
  {
    id: "custom",
    label: "Custom",
    title: "",
    body: "",
  },
];

/** Treat datetime-local value as Asia/Kolkata wall clock → UTC ISO. */
function istDatetimeLocalToIso(localValue: string): string {
  const v = String(localValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return "";
  const d = new Date(`${v}:00+05:30`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatIst(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function defaultScheduleLocal() {
  // Now + 1 hour in IST as datetime-local string
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(Date.now() + 60 * 60 * 1000)).map((p) => [p.type, p.value]),
  );
  const hour = String(parts.hour === "24" ? "00" : parts.hour).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function PortalPushBroadcastPanel() {
  const [templateId, setTemplateId] = useState("portal-access");
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [scheduleLocal, setScheduleLocal] = useState(defaultScheduleLocal);
  const [jobs, setJobs] = useState<BroadcastJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError("");
    try {
      const data = await apiFetch<PreviewResponse>("/portal-push-broadcast");
      setRecipients(Number(data.recipients) || 0);
      setCooldownMs(Math.max(0, Number(data.cooldownRemainingMs) || 0));
    } catch (err) {
      setRecipients(null);
      setPreviewError(
        err instanceof Error ? err.message : "Could not load recipient count",
      );
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const data = await apiFetch<{ ok?: boolean; jobs?: BroadcastJob[] }>(
        "/portal-push-broadcast/jobs",
      );
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      // Non-fatal: schedule list may fail if Website not deployed yet
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
    void loadJobs();
  }, [loadPreview, loadJobs]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const t = setInterval(() => {
      setCooldownMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownMs > 0]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t || id === "custom") return;
    setTitle(t.title);
    setBody(t.body);
  };

  const broadcast = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast.error("Title and message are required");
      return;
    }
    setLoadingPreview(true);
    let n = 0;
    try {
      const preview = await apiFetch<PreviewResponse>("/portal-push-broadcast");
      n = Number(preview.recipients) || 0;
      setRecipients(n);
      setCooldownMs(Math.max(0, Number(preview.cooldownRemainingMs) || 0));
      setPreviewError("");
      if (Number(preview.cooldownRemainingMs) > 0) {
        toast.error("Please wait for the cooldown before broadcasting again.");
        return;
      }
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Could not refresh recipient count",
      );
      toast.error("Refresh count failed — try again before sending.");
      return;
    } finally {
      setLoadingPreview(false);
    }
    if (
      !confirm(
        n > 0
          ? `Broadcast to ${n} member(s) with notifications enabled?`
          : "No opted-in members found. Send anyway? (nothing will be delivered)",
      )
    ) {
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch<BroadcastResponse>("/portal-push-broadcast", {
        method: "POST",
        body: JSON.stringify({ title: t, body: b }),
      });
      toast.success(
        `Broadcast done · ${data.membersSent ?? 0} member(s), ${data.pushSent ?? 0} device push(es)`,
      );
      if ((data.pushFailed ?? 0) > 0) {
        toast.message(
          `${data.pushFailed} device push(es) failed (expired subscriptions cleaned when possible)`,
        );
      }
      setCooldownMs(5 * 60 * 1000);
      await loadPreview();
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Broadcast failed");
      await loadPreview();
    } finally {
      setSending(false);
    }
  };

  const schedule = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast.error("Title and message are required");
      return;
    }
    const scheduledAt = istDatetimeLocalToIso(scheduleLocal);
    if (!scheduledAt) {
      toast.error("Pick a valid date and time (IST).");
      return;
    }
    setScheduling(true);
    try {
      await loadPreview();
      const data = await apiFetch<{
        ok?: boolean;
        job?: BroadcastJob;
        recipientsPreview?: number;
      }>("/portal-push-broadcast/jobs", {
        method: "POST",
        body: JSON.stringify({ title: t, body: b, scheduledAt }),
      });
      toast.success(
        `Scheduled for ${formatIst(scheduledAt)} · ~${data.recipientsPreview ?? recipients ?? "—"} member(s) (re-counted at send)`,
      );
      setScheduleLocal(defaultScheduleLocal());
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule");
    } finally {
      setScheduling(false);
    }
  };

  const cancelJob = async (id: string) => {
    if (!confirm("Cancel this scheduled broadcast?")) return;
    setCancellingId(id);
    try {
      await apiFetch(`/portal-push-broadcast/jobs/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Scheduled broadcast cancelled");
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setCancellingId(null);
    }
  };

  const cooldownSec = Math.ceil(cooldownMs / 1000);
  const canSend =
    !sending &&
    !loadingPreview &&
    cooldownMs <= 0 &&
    Boolean(title.trim() && body.trim()) &&
    !previewError;
  const canSchedule =
    !scheduling && Boolean(title.trim() && body.trim()) && Boolean(scheduleLocal);

  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "running");
  const recentJobs = jobs.filter((j) => j.status !== "pending" && j.status !== "running").slice(0, 10);

  return (
    <div className="space-y-3 rounded-2xl border border-violet-200/70 bg-gradient-to-b from-violet-50/40 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/20 dark:to-card">
      <div>
        <p className="text-sm font-medium text-foreground">Broadcast to members</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          Send now or schedule for later (IST). Auto-send refreshes the recipient count first.
          Does not change billing reminders, WhatsApp, or member portal switches. Owner only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              templateId === t.id
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-black/10 bg-white/80 text-foreground hover:bg-violet-50 dark:border-white/15 dark:bg-white/[0.04]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="broadcast-title">Title</Label>
        <Input
          id="broadcast-title"
          value={title}
          maxLength={120}
          placeholder="Notification title"
          onChange={(e) => {
            setTemplateId("custom");
            setTitle(e.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="broadcast-body">Message</Label>
        <textarea
          id="broadcast-body"
          value={body}
          maxLength={500}
          rows={4}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Write the message members will see…"
          onChange={(e) => {
            setTemplateId("custom");
            setBody(e.target.value);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {previewError ? (
            <span className="text-rose-700 dark:text-rose-300">{previewError}</span>
          ) : loadingPreview ? (
            "Counting opted-in members…"
          ) : (
            <>
              Will send to{" "}
              <span className="font-semibold text-foreground">{recipients ?? "—"}</span>{" "}
              member(s) with notifications on
              {cooldownSec > 0 ? <> · cooldown {cooldownSec}s</> : null}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loadingPreview || sending}
            onClick={() => void loadPreview()}
          >
            Refresh count
          </Button>
          <Button type="button" size="sm" disabled={!canSend} onClick={() => void broadcast()}>
            {sending ? "Broadcasting…" : "Broadcast now"}
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <Label htmlFor="broadcast-schedule">Schedule for later (IST)</Label>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="broadcast-schedule"
            type="datetime-local"
            value={scheduleLocal}
            onChange={(e) => setScheduleLocal(e.target.value)}
            className="max-w-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canSchedule}
            onClick={() => void schedule()}
          >
            {scheduling ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Add as many scheduled messages as you need. Each sends automatically at its time after a
          fresh recipient count. Cancel anytime while still pending.
        </p>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Scheduled broadcasts</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={jobsLoading}
            onClick={() => void loadJobs()}
          >
            {jobsLoading ? "Loading…" : "Refresh list"}
          </Button>
        </div>
        {pendingJobs.length === 0 && recentJobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scheduled messages yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...pendingJobs, ...recentJobs].map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-muted-foreground line-clamp-2">{job.body}</p>
                    <p className="text-muted-foreground">
                      {formatIst(job.scheduledAt)} ·{" "}
                      <span className="font-medium text-foreground">{job.status}</span>
                      {job.recipientsAtSend != null
                        ? ` · sent to ${job.recipientsAtSend}`
                        : null}
                      {job.error ? ` · ${job.error}` : null}
                    </p>
                  </div>
                  {job.status === "pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={cancellingId === job.id}
                      onClick={() => void cancelJob(job.id)}
                    >
                      {cancellingId === job.id ? "…" : "Cancel"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
