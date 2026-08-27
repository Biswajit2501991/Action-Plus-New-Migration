import type { PortalAccessStatusKey } from "@/lib/member-portal-access-by-status";

export type WorkoutPlanByStatus = Record<PortalAccessStatusKey, boolean>;

/** Legacy QA list — no longer used for tile visibility (kept for settings API compat). */
export const DEFAULT_WORKOUT_PLAN_TESTER_NAMES = ["Bis Test"];

export const DEFAULT_WORKOUT_PLAN_BY_STATUS: WorkoutPlanByStatus = {
  Active: true,
  Hold: false,
  Deactivated: false,
  Cancelled: false,
};

export function normalizeWorkoutPlanByStatus(input: unknown): WorkoutPlanByStatus {
  const src =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out: WorkoutPlanByStatus = { ...DEFAULT_WORKOUT_PLAN_BY_STATUS };
  for (const key of Object.keys(DEFAULT_WORKOUT_PLAN_BY_STATUS) as PortalAccessStatusKey[]) {
    const lower = key.toLowerCase();
    if (key in src) out[key] = Boolean(src[key]);
    else if (lower in src) out[key] = Boolean(src[lower]);
  }
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
