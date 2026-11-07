"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { apiFetch } from "@/services/api/client";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function readSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/sw-staff.js");
  return reg?.pushManager.getSubscription() ?? null;
}

export function StaffPushToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ enabled?: boolean }>("/staff-push/status");
      setOn(Boolean(data.enabled));
    } catch {
      setOn(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setHint("This phone cannot show alerts. Add the Gym app to the Home Screen and try again.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setHint("Allow notifications to get visitor and chat alerts.");
      return;
    }
    const vapid = await apiFetch<{ publicKey?: string }>("/staff-push/vapid");
    const publicKey = String(vapid.publicKey || "").trim();
    if (!publicKey) {
      setHint("Phone alerts are not set up on the server yet.");
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw-staff.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const json = sub.toJSON();
    await apiFetch("/staff-push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
    setOn(true);
    setHint("");
  };

  const disable = async () => {
    const sub = await readSubscription();
    await apiFetch("/staff-push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: sub?.endpoint || "" }),
    });
    await sub?.unsubscribe().catch(() => undefined);
    setOn(false);
    setHint("");
  };

  return (
    <button
      type="button"
      disabled={busy}
      title={hint || (on ? "Phone alerts are on for this phone" : "Turn on phone alerts for this phone")}
      aria-pressed={on}
      onClick={() => {
        setBusy(true);
        void (on ? disable() : enable())
          .catch((err: Error) => setHint(err.message || "Could not update phone alerts"))
          .finally(() => setBusy(false));
      }}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition",
        on
          ? "border-teal-300/80 bg-teal-50 text-teal-900 dark:border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-100"
          : "border-slate-200/80 bg-white/80 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
        busy && "opacity-60",
      )}
    >
      <BellRing className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{on ? "Alerts on" : "Phone alerts"}</span>
    </button>
  );
}
