export const NEW_RECORD_BADGE_HOURS = 48;

export function parseApgTimestampMs(value) {
  const t = new Date(String(value || '').trim()).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** True when record was created within the last `hours` (default 48). Pure read-only UI logic. */
export function isRecordNewWithinHours(timestamp, hours = NEW_RECORD_BADGE_HOURS, nowMs = Date.now()) {
  const ms = parseApgTimestampMs(timestamp);
  if (ms <= 0) return false;
  const windowHours = Number(hours) > 0 ? Number(hours) : NEW_RECORD_BADGE_HOURS;
  return (nowMs - ms) < windowHours * 60 * 60 * 1000;
}
