/**
 * Staff attendance day keys must follow gym local calendar (IST), not UTC.
 * Login/logout punches send ISO timestamps; slicing YYYY-MM-DD from the ISO
 * string buckets early-morning IST punches onto the previous UTC date.
 */

export const DEFAULT_ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';

const TZ_ALIASES = {
  IST: 'Asia/Kolkata',
  INDIA: 'Asia/Kolkata',
  'ASIA/KOLKATA': 'Asia/Kolkata',
};

/**
 * @param {string|null|undefined} timeZone
 * @returns {string} IANA timezone
 */
export function resolveAttendanceTimeZone(timeZone) {
  const raw = String(timeZone || '').trim();
  if (!raw) return DEFAULT_ATTENDANCE_TIME_ZONE;
  const aliased = TZ_ALIASES[raw.toUpperCase()];
  if (aliased) return aliased;
  return raw;
}

/**
 * Calendar YYYY-MM-DD for a punch/instant in the gym attendance timezone.
 * @param {string|Date|null|undefined} at
 * @param {string|null|undefined} timeZone
 * @returns {string} YYYY-MM-DD (empty when unparseable)
 */
export function attendanceCalendarDateKey(at, timeZone) {
  const zone = resolveAttendanceTimeZone(timeZone);
  const d = at instanceof Date ? at : new Date(String(at || '').trim() || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    // Invalid IANA zone → gym default (never fall back to UTC slice).
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: DEFAULT_ATTENDANCE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
  }
}

/** Today's attendance calendar date in gym timezone. */
export function attendanceTodayCalendarKey(timeZone, now = new Date()) {
  return attendanceCalendarDateKey(now, timeZone);
}
