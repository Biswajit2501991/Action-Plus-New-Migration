"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_COVER_TILES,
  type DashboardCoverPrefs,
  type DashboardCoverTileId,
  clampCoverGray,
  readDashboardCoverPrefs,
  writeDashboardCoverPrefs,
} from "@/features/dashboard/dashboard-privacy";

export function useDashboardCoverPrefs(gymId: string) {
  const [prefs, setPrefs] = useState<DashboardCoverPrefs>(() => readDashboardCoverPrefs(gymId));

  useEffect(() => {
    setPrefs(readDashboardCoverPrefs(gymId));
  }, [gymId]);

  function update(next: DashboardCoverPrefs) {
    const saved: DashboardCoverPrefs = {
      enabled: next.enabled === true,
      grayPercent: clampCoverGray(next.grayPercent),
      tiles: { ...next.tiles },
    };
    setPrefs(saved);
    writeDashboardCoverPrefs(gymId, saved);
  }

  return { prefs, update };
}

export function PrivacyCover({
  active,
  grayPercent,
  label,
  revealed,
  onShow,
  onHide,
  className,
  children,
}: {
  active: boolean;
  grayPercent: number;
  label: string;
  revealed: boolean;
  onShow: () => void;
  onHide: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!active) return <div className={className}>{children}</div>;

  const strength = clampCoverGray(grayPercent) / 100;
  const covered = !revealed;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      <div
        className={covered ? "pointer-events-none select-none" : undefined}
        style={covered ? { filter: `blur(${Math.round(4 + strength * 12)}px)` } : undefined}
        aria-hidden={covered}
      >
        {children}
      </div>
      {covered ? (
        <div
          className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl pt-3"
          style={{ backgroundColor: `rgba(71, 85, 105, ${0.42 + strength * 0.4})` }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Button type="button" size="sm" variant="secondary" onClick={onShow} aria-label={`Show ${label}`}>
              <Eye className="h-4 w-4" />
              Show
            </Button>
            <span className="text-[11px] font-medium tracking-wide text-white/90">{label}</span>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="absolute bottom-2 right-2 z-10 bg-background/90"
          onClick={onHide}
          aria-label={`Hide ${label}`}
        >
          <EyeOff className="h-4 w-4" />
          Hide
        </Button>
      )}
    </div>
  );
}

export function DashboardCoverSettings({
  open,
  prefs,
  onChange,
}: {
  open: boolean;
  prefs: DashboardCoverPrefs;
  onChange: (next: DashboardCoverPrefs) => void;
}) {
  if (!open) return null;

  function setTile(id: DashboardCoverTileId, checked: boolean) {
    onChange({ ...prefs, tiles: { ...prefs.tiles, [id]: checked } });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Tile cover</CardTitle>
        <p className="text-sm text-muted-foreground">
          Covered tiles stay gray until Show. Leaving this page covers them again. Saved on this browser.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => onChange({ ...prefs, enabled: e.target.checked })}
          />
          Cover sensitive tiles
        </label>
        <label className={cn("block text-sm", !prefs.enabled && "opacity-50")}>
          <span className="mb-1 flex items-center justify-between">
            <span>Gray strength</span>
            <span className="tabular-nums text-muted-foreground">{clampCoverGray(prefs.grayPercent)}%</span>
          </span>
          <input
            type="range"
            min={30}
            max={80}
            step={5}
            disabled={!prefs.enabled}
            value={clampCoverGray(prefs.grayPercent)}
            onChange={(e) => onChange({ ...prefs, grayPercent: Number(e.target.value) })}
            className="w-full"
          />
        </label>
        <fieldset disabled={!prefs.enabled} className={cn("space-y-2", !prefs.enabled && "opacity-50")}>
          <legend className="mb-1 text-sm font-medium">Tiles to cover</legend>
          {DASHBOARD_COVER_TILES.map((tile) => (
            <label key={tile.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.tiles[tile.id]}
                onChange={(e) => setTile(tile.id, e.target.checked)}
              />
              {tile.label}
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}
