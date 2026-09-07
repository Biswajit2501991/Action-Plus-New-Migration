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

export function PortalPushBroadcastPanel() {
  const [templateId, setTemplateId] = useState("portal-access");
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewError, setPreviewError] = useState("");

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

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

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
    const n = recipients ?? 0;
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
        toast.message(`${data.pushFailed} device push(es) failed (expired subscriptions cleaned when possible)`);
      }
      setCooldownMs(5 * 60 * 1000);
      await loadPreview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Broadcast failed");
      await loadPreview();
    } finally {
      setSending(false);
    }
  };

  const cooldownSec = Math.ceil(cooldownMs / 1000);
  const canSend =
    !sending &&
    !loadingPreview &&
    cooldownMs <= 0 &&
    Boolean(title.trim() && body.trim()) &&
    !previewError;

  return (
    <div className="space-y-3 rounded-2xl border border-violet-200/70 bg-gradient-to-b from-violet-50/40 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/20 dark:to-card">
      <div>
        <p className="text-sm font-medium text-foreground">Broadcast to members</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          Send one Web Push to all Active members who enabled notifications. Does not change
          billing reminders, WhatsApp, or member portal switches. Owner only.
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
              {cooldownSec > 0 ? (
                <>
                  {" "}
                  · cooldown {cooldownSec}s
                </>
              ) : null}
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
          <Button
            type="button"
            size="sm"
            disabled={!canSend}
            onClick={() => void broadcast()}
          >
            {sending ? "Broadcasting…" : "Broadcast now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
