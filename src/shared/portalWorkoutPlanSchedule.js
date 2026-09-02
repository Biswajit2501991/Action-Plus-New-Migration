/** Shared Workout Plan tile date-window helpers (portal enforces in IST). */

const YMD = /^(\d{4}-\d{2}-\d{2})$/;

export function normalizePortalWorkoutPlanDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const m = YMD.exec(raw.slice(0, 10));
  return m ? m[1] : null;
}

export function formatIstYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date instanceof Date ? date : new Date(date));
}

/**
 * Returns whether today falls within the optional schedule window.
 * When both bounds are null, returns ok: true (no schedule constraint).
 */
export function evaluateWorkoutPlanScheduleWindow(input = {}) {
  const from = normalizePortalWorkoutPlanDate(input.enabledFrom);
  const until = normalizePortalWorkoutPlanDate(input.enabledUntil);
  if (!from && !until) return { ok: true, reason: null };

  const today = normalizePortalWorkoutPlanDate(input.todayYmd) || formatIstYmd(new Date());
  if (from && today < from) return { ok: false, reason: 'date_not_started' };
  if (until && today > until) return { ok: false, reason: 'date_expired' };
  return { ok: true, reason: null };
}

export function workoutPlanScheduleStatusLabel(input = {}) {
  const from = normalizePortalWorkoutPlanDate(input.enabledFrom);
  const until = normalizePortalWorkoutPlanDate(input.enabledUntil);
  if (!from && !until) return null;

  const today = normalizePortalWorkoutPlanDate(input.todayYmd) || formatIstYmd(new Date());
  const win = evaluateWorkoutPlanScheduleWindow({ enabledFrom: from, enabledUntil: until, todayYmd: today });
  if (!win.ok) {
    if (win.reason === 'date_not_started' && from) {
      return `Starts on ${from}`;
    }
    if (win.reason === 'date_expired' && until) {
      return `Expired on ${until}`;
    }
    return 'Outside schedule';
  }
  if (from && until) return `Active ${from} – ${until}`;
  if (until) return `Active until ${until}`;
  if (from) return `Active from ${from}`;
  return null;
}
