"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/services/api/client";
import {
  CHHATH_PUJA_THEME,
  DIWALI_THEME,
  GYM_FESTIVAL_SYNC_EVENT,
  HOLI_2027_THEME,
  NEW_YEAR_2027_THEME,
  PREVIEW_STORAGE_KEY,
  applyDocumentFestivalTheme,
  clearFestivalPreview,
  gymManagerAllowsTheme,
  type FestivalCatalog,
  type FestivalThemeId,
} from "@/lib/festival-theme";
import { GymDiwaliEffects } from "@/features/festival/diwali-effects";
import { GymChhathEffects } from "@/features/festival/chhath-effects";
import { GymNewYearEffects } from "@/features/festival/new-year-effects";
import { GymHoliEffects } from "@/features/festival/holi-effects";

const MAX_TIMEOUT = 2_147_000_000;

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

    async function loadGymTheme() {
      try {
        const data = await apiFetch<{
          catalog?: FestivalCatalog;
          live?: FestivalThemeId | null;
        }>("/festival-theme");
        if (cancelled) return;
        const catalog = data.catalog || null;
        const liveTheme = data.live || null;
        setLive(gymManagerAllowsTheme(catalog, liveTheme) ? liveTheme : null);
        const nextPreview = readPreview();
        if (nextPreview && !gymManagerAllowsTheme(catalog, nextPreview)) {
          clearFestivalPreview();
          setPreview(null);
        } else {
          setPreview(nextPreview);
        }
        timers.forEach((id) => window.clearTimeout(id));
        timers.length = 0;
        const now = Date.now();
        for (const cfg of Object.values(data.catalog || {})) {
          if (!cfg?.enabled || !cfg.apply_gym_manager) continue;
          for (const iso of [cfg.starts_at, cfg.ends_at]) {
            const at = iso ? new Date(iso).getTime() : NaN;
            const ms = at - now;
            if (Number.isFinite(at) && ms > 0) {
              timers.push(
                window.setTimeout(() => {
                  void loadGymTheme();
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
    }

    void loadGymTheme();
    const onSync = () => {
      void loadGymTheme();
    };
    window.addEventListener(GYM_FESTIVAL_SYNC_EVENT, onSync);
    return () => {
      cancelled = true;
      window.removeEventListener(GYM_FESTIVAL_SYNC_EVENT, onSync);
      timers.forEach((id) => window.clearTimeout(id));
      applyDocumentFestivalTheme(null);
    };
  }, []);

  const theme = preview || live;

  useEffect(() => {
    applyDocumentFestivalTheme(theme);
    return () => applyDocumentFestivalTheme(null);
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
