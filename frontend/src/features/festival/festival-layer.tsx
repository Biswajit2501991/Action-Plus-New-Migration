"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/services/api/client";
import {
  CHHATH_PUJA_THEME,
  DIWALI_THEME,
  HOLI_2027_THEME,
  NEW_YEAR_2027_THEME,
  PREVIEW_STORAGE_KEY,
  type FestivalCatalog,
  type FestivalThemeId,
} from "@/lib/festival-theme";
import { GymDiwaliEffects } from "@/features/festival/diwali-effects";
import { GymChhathEffects } from "@/features/festival/chhath-effects";
import { GymNewYearEffects } from "@/features/festival/new-year-effects";
import { GymHoliEffects } from "@/features/festival/holi-effects";

const ATTR = "data-festival";
const MAX_TIMEOUT = 2_147_000_000;

function applyAttr(theme: FestivalThemeId | null) {
  if (typeof document === "undefined") return;
  if (theme === DIWALI_THEME) document.documentElement.setAttribute(ATTR, "diwali");
  else if (theme === CHHATH_PUJA_THEME) document.documentElement.setAttribute(ATTR, "chhath-puja");
  else if (theme === NEW_YEAR_2027_THEME) document.documentElement.setAttribute(ATTR, "new-year-2027");
  else if (theme === HOLI_2027_THEME) document.documentElement.setAttribute(ATTR, "holi-2027");
  else if (theme === "durga_puja") document.documentElement.setAttribute(ATTR, "durga-puja");
  else document.documentElement.removeAttribute(ATTR);
}

function readPreview(): FestivalThemeId | null {
  try {
    const v = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
    if (
      v === DIWALI_THEME ||
      v === CHHATH_PUJA_THEME ||
      v === NEW_YEAR_2027_THEME ||
      v === HOLI_2027_THEME ||
      v === "durga_puja"
    )
      return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function FestivalLayer() {
  const pathname = usePathname();
  const [live, setLive] = useState<FestivalThemeId | null>(null);
  const [preview, setPreview] = useState<FestivalThemeId | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    void (async () => {
      try {
        const data = await apiFetch<{
          catalog?: FestivalCatalog;
          live?: FestivalThemeId | null;
        }>("/festival-theme");
        if (cancelled) return;
        setLive(data.live || null);
        setPreview(readPreview());
        const now = Date.now();
        for (const cfg of Object.values(data.catalog || {})) {
          if (!cfg?.enabled || !cfg.apply_gym_manager) continue;
          for (const iso of [cfg.starts_at, cfg.ends_at]) {
            const at = iso ? new Date(iso).getTime() : NaN;
            const ms = at - now;
            if (Number.isFinite(at) && ms > 0) {
              timers.push(
                window.setTimeout(() => {
                  void apiFetch<{ live?: FestivalThemeId | null }>("/festival-theme")
                    .then((next) => {
                      if (!cancelled) setLive(next.live || null);
                    })
                    .catch(() => undefined);
                }, Math.min(ms, MAX_TIMEOUT)),
              );
            }
          }
        }
      } catch {
        if (!cancelled) {
          setLive(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      applyAttr(null);
    };
  }, []);

  const theme = preview || live;

  useEffect(() => {
    applyAttr(theme);
    return () => applyAttr(null);
  }, [theme]);

  if (!theme) return null;

  const onDashboard = pathname === "/dashboard";

  return (
    <div className="gym-festival-layer" aria-hidden>
      {theme === DIWALI_THEME ? (
        <GymDiwaliEffects greeting={onDashboard} />
      ) : theme === CHHATH_PUJA_THEME ? (
        <GymChhathEffects greeting={onDashboard} />
      ) : theme === NEW_YEAR_2027_THEME ? (
        <GymNewYearEffects greeting={onDashboard} />
      ) : theme === HOLI_2027_THEME ? (
        <GymHoliEffects greeting={onDashboard} />
      ) : (
        <div className="gym-festival-decor">
          <span className="gym-festival-diya gym-festival-diya-left" />
          <span className="gym-festival-diya gym-festival-diya-right" />
        </div>
      )}
    </div>
  );
}
