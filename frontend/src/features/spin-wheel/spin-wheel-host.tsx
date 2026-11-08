"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/services/api/client";
import { SpinWheelModal, type SpinPrize } from "@/features/spin-wheel/spin-wheel-modal";
import type { SpinSlice } from "@/features/spin-wheel/spin-wheel";

type LiveWheel = {
  active?: boolean;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  segments?: SpinSlice[];
  closeOverlay?: boolean;
  cooldownHours?: number;
  popupDelaySec?: number;
};

const HIDE_KEY = "apg_spin_gym_hide_until";

export function SpinWheelHost({ active }: { active: boolean }) {
  const [live, setLive] = useState<LiveWheel | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer = 0;
    apiFetch<LiveWheel>("/spin-wheel/live")
      .then((payload) => {
        if (cancelled || !payload?.active || !payload.segments?.length) return;
        const hiddenUntil = Number(window.localStorage.getItem(HIDE_KEY) || 0);
        if (hiddenUntil > Date.now()) return;
        setLive(payload);
        const delay = Math.min(30, Math.max(0, Number(payload.popupDelaySec || 0))) * 1000;
        timer = window.setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, delay);
      })
      .catch(() => {
        /* A missing wheel stays hidden. */
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  if (!live) return null;

  function hide() {
    const hours = Math.max(1, Number(live?.cooldownHours || 24));
    window.localStorage.setItem(HIDE_KEY, String(Date.now() + hours * 60 * 60 * 1000));
    setOpen(false);
  }

  return (
    <SpinWheelModal
      open={open}
      title={live.title || "Spin & Win"}
      subtitle={live.subtitle || ""}
      buttonLabel={live.buttonLabel || "SPIN"}
      segments={live.segments || []}
      closeOverlay={live.closeOverlay !== false}
      onClose={hide}
      onSpin={() => apiFetch<SpinPrize>("/spin-wheel/spin", { method: "POST", body: "{}" })}
    />
  );
}
