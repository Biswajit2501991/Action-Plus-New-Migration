export const DASHBOARD_COVER_TILES = [
  { id: "collectedRevenue", label: "Collected Revenue" },
  { id: "revenueTrend", label: "Revenue trend" },
  { id: "recentPayments", label: "Recent payments" },
] as const;

export type DashboardCoverTileId = (typeof DASHBOARD_COVER_TILES)[number]["id"];

export type DashboardCoverPrefs = {
  enabled: boolean;
  grayPercent: number;
  tiles: Record<DashboardCoverTileId, boolean>;
};

export const DEFAULT_DASHBOARD_COVER_PREFS: DashboardCoverPrefs = {
  enabled: true,
  grayPercent: 50,
  tiles: {
    collectedRevenue: true,
    revenueTrend: false,
    recentPayments: false,
  },
};

const GRAY_MIN = 30;
const GRAY_MAX = 80;

export function clampCoverGray(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DASHBOARD_COVER_PREFS.grayPercent;
  return Math.min(GRAY_MAX, Math.max(GRAY_MIN, Math.round(value)));
}

export function coverStorageKey(gymId: string) {
  const id = String(gymId || "").trim() || "default";
  return `apg.dashboard.tileCover:${id}`;
}

export function parseDashboardCoverPrefs(raw: string | null): DashboardCoverPrefs {
  if (!raw) return DEFAULT_DASHBOARD_COVER_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<DashboardCoverPrefs> | null;
    const tiles = parsed?.tiles;
    return {
      enabled: parsed?.enabled !== false,
      grayPercent: clampCoverGray(Number(parsed?.grayPercent)),
      tiles: {
        collectedRevenue: tiles?.collectedRevenue !== false,
        revenueTrend: tiles?.revenueTrend === true,
        recentPayments: tiles?.recentPayments === true,
      },
    };
  } catch {
    return DEFAULT_DASHBOARD_COVER_PREFS;
  }
}

export function readDashboardCoverPrefs(gymId: string): DashboardCoverPrefs {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_COVER_PREFS;
  try {
    return parseDashboardCoverPrefs(localStorage.getItem(coverStorageKey(gymId)));
  } catch {
    return DEFAULT_DASHBOARD_COVER_PREFS;
  }
}

export function writeDashboardCoverPrefs(gymId: string, prefs: DashboardCoverPrefs) {
  if (typeof window === "undefined") return;
  const next: DashboardCoverPrefs = {
    enabled: prefs.enabled === true,
    grayPercent: clampCoverGray(prefs.grayPercent),
    tiles: {
      collectedRevenue: prefs.tiles.collectedRevenue === true,
      revenueTrend: prefs.tiles.revenueTrend === true,
      recentPayments: prefs.tiles.recentPayments === true,
    },
  };
  try {
    localStorage.setItem(coverStorageKey(gymId), JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
