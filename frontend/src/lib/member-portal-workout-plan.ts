import type { PortalAccessStatusKey } from "@/lib/member-portal-access-by-status";

export type WorkoutPlanStatusWindow = { from: string | null; until: string | null };

export type WorkoutPlanStatusWindows = Record<PortalAccessStatusKey, WorkoutPlanStatusWindow>;

export type WorkoutPlanByStatus = Record<PortalAccessStatusKey, boolean> & {
  windows: WorkoutPlanStatusWindows;
};

const WORKOUT_PLAN_STATUS_KEYS: PortalAccessStatusKey[] = [
  "Active",
  "Hold",
  "Deactivated",
  "Cancelled",
];

const YMD = /^(\d{4}-\d{2}-\d{2})$/;

function emptyWorkoutPlanStatusWindows(): WorkoutPlanStatusWindows {
  return {
    Active: { from: null, until: null },
    Hold: { from: null, until: null },
    Deactivated: { from: null, until: null },
    Cancelled: { from: null, until: null },
  };
}

function normalizeWindowDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const m = YMD.exec(String(value).trim().slice(0, 10));
  return m ? m[1] : null;
}

/** Legacy QA list — no longer used for tile visibility (kept for settings API compat). */
export const DEFAULT_WORKOUT_PLAN_TESTER_NAMES = ["Bis Test"];

export const DEFAULT_WORKOUT_PLAN_BY_STATUS: WorkoutPlanByStatus = {
  Active: true,
  Hold: false,
  Deactivated: false,
  Cancelled: false,
  windows: emptyWorkoutPlanStatusWindows(),
};

export function normalizeWorkoutPlanStatusWindows(input: unknown): WorkoutPlanStatusWindows {
  const root =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const bag =
    root.windows && typeof root.windows === "object" && !Array.isArray(root.windows)
      ? (root.windows as Record<string, unknown>)
      : {};
  const out = emptyWorkoutPlanStatusWindows();
  for (const key of WORKOUT_PLAN_STATUS_KEYS) {
    const raw = bag[key] ?? bag[key.toLowerCase()];
    const row =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    out[key] = {
      from: normalizeWindowDate(row.from),
      until: normalizeWindowDate(row.until),
    };
  }
  return out;
}

export function workoutPlanStatusWindowError(byStatus: WorkoutPlanByStatus): string | null {
  for (const key of WORKOUT_PLAN_STATUS_KEYS) {
    const window = byStatus.windows?.[key];
    if (window?.from && window?.until && window.from > window.until) {
      return `${key} members: start date must be on or before end date.`;
    }
  }
  return null;
}

export function normalizeWorkoutPlanByStatus(input: unknown): WorkoutPlanByStatus {
  const src =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out: WorkoutPlanByStatus = {
    Active: DEFAULT_WORKOUT_PLAN_BY_STATUS.Active,
    Hold: DEFAULT_WORKOUT_PLAN_BY_STATUS.Hold,
    Deactivated: DEFAULT_WORKOUT_PLAN_BY_STATUS.Deactivated,
    Cancelled: DEFAULT_WORKOUT_PLAN_BY_STATUS.Cancelled,
    windows: emptyWorkoutPlanStatusWindows(),
  };
  for (const key of WORKOUT_PLAN_STATUS_KEYS) {
    const lower = key.toLowerCase();
    if (key in src) out[key] = Boolean(src[key]);
    else if (lower in src) out[key] = Boolean(src[lower]);
  }
  out.windows = normalizeWorkoutPlanStatusWindows(src);
  return out;
}

/**
 * Legacy — stored in settings but not used for visibility gating.
 * Visibility: Home tiles Workout Plan OFF → per-member switch; ON → Workout Plan by status.
 */
export function normalizeWorkoutPlanTesterNames(input: unknown): string[] {
  if (input == null) return [...DEFAULT_WORKOUT_PLAN_TESTER_NAMES];
  if (!Array.isArray(input)) {
    const one = String(input || "").trim();
    return one ? [one] : [...DEFAULT_WORKOUT_PLAN_TESTER_NAMES];
  }
  return input
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function testerNamesToText(names: string[]) {
  return names.join("\n");
}

export function testerNamesFromText(text: string) {
  return text
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 40);
}
