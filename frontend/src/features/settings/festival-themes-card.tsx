"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import {
  CHHATH_PUJA_THEME,
  DIWALI_THEME,
  DURGA_PUJA_THEME,
  HOLI_2027_THEME,
  NEW_YEAR_2027_THEME,
  PREVIEW_STORAGE_KEY,
  clearFestivalPreview,
  emptyFestivalCatalog,
  festivalStatusLabel,
  isoToIstDatetimeLocal,
  istDatetimeLocalToIso,
  type FestivalCatalog,
  type FestivalSelectKey,
  type FestivalThemeId,
} from "@/lib/festival-theme";
import { cn } from "@/lib/utils";

function applyWhere(website: boolean, gym: boolean) {
  if (website && gym) return "both";
  if (gym) return "gym";
  return "website";
}

export function FestivalThemesCard({
  open,
  onToggleOpen,
}: {
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [catalog, setCatalog] = useState<FestivalCatalog>(emptyFestivalCatalog);
  const [selected, setSelected] = useState<FestivalSelectKey>("default");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ catalog?: FestivalCatalog }>("/festival-theme");
        if (cancelled) return;
        const next = data.catalog || emptyFestivalCatalog();
        setCatalog({ ...emptyFestivalCatalog(), ...next });
        if (next.holi_2027?.enabled) setSelected(HOLI_2027_THEME);
        else if (next.new_year_2027?.enabled) setSelected(NEW_YEAR_2027_THEME);
        else if (next.chhath_puja?.enabled) setSelected(CHHATH_PUJA_THEME);
        else if (next.diwali?.enabled) setSelected(DIWALI_THEME);
        else if (next.durga_puja?.enabled) setSelected(DURGA_PUJA_THEME);
        else setSelected("default");
      } catch {
        if (!cancelled) toast.error("Could not load festival themes. The rest of Settings still works.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = selected === "default" ? null : catalog[selected];
  const status = current ? festivalStatusLabel(current) : "Default theme";

  async function save() {
    setBusy(true);
    try {
      if (selected === "default") {
        clearFestivalPreview();
        await apiFetch("/festival-theme", {
          method: "PATCH",
          body: JSON.stringify({ theme: "default", enabled: false }),
        });
        setCatalog((prev) => ({
          ...prev,
          durga_puja: { ...prev.durga_puja, enabled: false },
          diwali: { ...prev.diwali, enabled: false },
          chhath_puja: { ...prev.chhath_puja, enabled: false },
          new_year_2027: { ...prev.new_year_2027, enabled: false },
          holi_2027: { ...prev.holi_2027, enabled: false },
        }));
        toast.success("Default theme saved. Festival dates are kept.");
        return;
      }
      const cfg = catalog[selected];
      const starts_at = cfg.starts_at || "";
      const ends_at = cfg.ends_at || "";
      const websiteOnly = !cfg.apply_gym_manager;
      if (websiteOnly) clearFestivalPreview();
      await apiFetch("/festival-theme", {
        method: "PATCH",
        body: JSON.stringify({
          theme: selected,
          enabled: cfg.enabled,
          starts_at,
          ends_at,
          apply_website: cfg.apply_website,
          apply_gym_manager: cfg.apply_gym_manager,
        }),
      });
      toast.success(
        websiteOnly
          ? "Festival theme saved for the public website. Gym Manager stays on the default look."
          : "Festival theme saved.",
      );
      if (websiteOnly) window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the festival theme.");
    } finally {
      setBusy(false);
    }
  }

  function preview() {
    try {
      if (selected === "default") {
        clearFestivalPreview();
      } else if (!catalog[selected].apply_gym_manager) {
        clearFestivalPreview();
        toast.message("This theme is for the public website only, so it will not preview in Gym Manager.");
        window.setTimeout(() => window.location.reload(), 600);
        return;
      } else {
        sessionStorage.setItem(PREVIEW_STORAGE_KEY, selected);
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  }

  return (
    <Card className="overflow-hidden border-amber-200/80 shadow-sm dark:border-amber-900/40">
      <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-amber-100/80 bg-gradient-to-r from-amber-50 to-white px-4 py-3.5 text-left dark:border-border dark:from-amber-950/30 dark:to-card"
        onClick={onToggleOpen}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/60">
            <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Themes</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Default, Durga Puja, Diwali, Chhath Puja, New Year 2027, and Holi 2027. IST schedule. Owner only.
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <CardContent className="space-y-4 p-4">
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading themes…</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="festival-theme">Theme</Label>
                <select
                  id="festival-theme"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value as FestivalSelectKey)}
                >
                  <option value="default">Default Theme</option>
                  <option value={DURGA_PUJA_THEME}>Durga Puja Theme</option>
                  <option value={DIWALI_THEME}>Diwali Theme</option>
                  <option value={CHHATH_PUJA_THEME}>Chhath Puja Theme</option>
                  <option value={NEW_YEAR_2027_THEME}>New Year 2027</option>
                  <option value={HOLI_2027_THEME}>Holi Colour Blast 2027</option>
                </select>
              </div>
              {current ? (
                <>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
                    <span>Enable this theme</span>
                    <input
                      type="checkbox"
                      checked={current.enabled}
                      onChange={(e) =>
                        setCatalog((prev) => ({
                          ...prev,
                          [selected as FestivalThemeId]: {
                            ...prev[selected as FestivalThemeId],
                            enabled: e.target.checked,
                          },
                        }))
                      }
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Starts (IST)</Label>
                      <Input
                        type="datetime-local"
                        value={isoToIstDatetimeLocal(current.starts_at)}
                        onChange={(e) =>
                          setCatalog((prev) => ({
                            ...prev,
                            [selected as FestivalThemeId]: {
                              ...prev[selected as FestivalThemeId],
                              starts_at: istDatetimeLocalToIso(e.target.value) || null,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ends (IST)</Label>
                      <Input
                        type="datetime-local"
                        value={isoToIstDatetimeLocal(current.ends_at)}
                        onChange={(e) =>
                          setCatalog((prev) => ({
                            ...prev,
                            [selected as FestivalThemeId]: {
                              ...prev[selected as FestivalThemeId],
                              ends_at: istDatetimeLocalToIso(e.target.value) || null,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apply to</Label>
                    <select
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={applyWhere(current.apply_website, current.apply_gym_manager)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCatalog((prev) => ({
                          ...prev,
                          [selected as FestivalThemeId]: {
                            ...prev[selected as FestivalThemeId],
                            apply_website: v === "website" || v === "both",
                            apply_gym_manager: v === "gym" || v === "both",
                          },
                        }));
                      }}
                    >
                      <option value="website">Public Website Only</option>
                      <option value="gym">Gym Management App Only</option>
                      <option value="both">Both Website and Gym Management App</option>
                    </select>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Saving Default turns festival skins off. Dates stay for later.
                </p>
              )}
              <p className={cn("text-xs text-muted-foreground")}>Status: {status}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={preview}>
                  Preview Theme
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
