/** Workout Plan tile schedule helpers for Gym Manager UI (portal enforces in IST). */

const YMD = /^(\d{4}-\d{2}-\d{2})$/;

export function normalizeWorkoutPlanScheduleDate(value?: string | null): string {
  if (!value) return "";
  const m = YMD.exec(String(value).trim().slice(0, 10));
  return m ? m[1] : "";
}

export function workoutPlanScheduleStatusLabel(input: {
  enabledFrom?: string | null;
  enabledUntil?: string | null;
  todayYmd?: string;
}): string | null {
  const from = normalizeWorkoutPlanScheduleDate(input.enabledFrom);
  const until = normalizeWorkoutPlanScheduleDate(input.enabledUntil);
  if (!from && !until) return null;

  const today = normalizeWorkoutPlanScheduleDate(input.todayYmd);
  if (from && today && today < from) return `Starts on ${from}`;
  if (until && today && today > until) return `Expired on ${until} (tile hidden on portal)`;
  if (from && until) return `Active ${from} – ${until}`;
  if (until) return `Active until ${until}`;
  if (from) return `Active from ${from}`;
  return null;
}

export function validateWorkoutPlanScheduleRange(from: string, until: string): string | null {
  const f = normalizeWorkoutPlanScheduleDate(from);
  const u = normalizeWorkoutPlanScheduleDate(until);
  if (f && u && f > u) return "Start date must be on or before end date.";
  return null;
}
