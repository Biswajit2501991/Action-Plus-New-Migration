/**
 * Compare first login ISO timestamp against branch shift start (HH:MM).
 * @param {string|Date|null|undefined} firstLoginAtIso
 * @param {string|null|undefined} shiftStartTime - "HH:MM" or "HH:MM:SS"
 * @param {{ graceMinutes?: number, shiftTimezone?: string|null }} [options]
 * @returns {boolean}
 */
export function isLoginLateForShift(firstLoginAtIso, shiftStartTime, options = {}) {
  const loginMs = Date.parse(String(firstLoginAtIso || ''));
  if (!Number.isFinite(loginMs)) return false;
  const shift = String(shiftStartTime || '').trim();
  if (!shift) return false;
  const match = shift.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  const shiftMinutes = (hours * 60) + minutes;

  const tzAlias = {
    IST: 'Asia/Kolkata',
    AEST: 'Australia/Sydney',
  };
  const tzRaw = String(options?.shiftTimezone || '').trim();
  const timeZone = tzAlias[tzRaw] || tzRaw || null;

  let loginMinutes = null;
  if (timeZone) {
    try {
      const login = new Date(loginMs);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(login);
      const pick = (type) => parts.find((p) => p.type === type)?.value || '';
      const hh = Number(pick('hour'));
      const mm = Number(pick('minute'));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        loginMinutes = (hh * 60) + mm;
      }
    } catch {
      loginMinutes = null;
    }
  }

  if (!Number.isFinite(loginMinutes)) {
    const login = new Date(loginMs);
    loginMinutes = (login.getHours() * 60) + login.getMinutes();
  }

  const graceMs = Math.max(0, Number(options.graceMinutes) || 0) * 60 * 1000;
  const diffMs = (loginMinutes - shiftMinutes) * 60 * 1000;
  return diffMs > graceMs;
}

/**
 * @param {Array<{ id?: string, shiftStartTime?: string|null, shift_timezone?: string|null, shiftTimezone?: string|null }>} gymCodes
 * @param {string} gymCodeId
 * @returns {{ shiftStartTime: string|null, shiftTimezone: string }}
 */
export function resolveBranchShiftConfig(gymCodes, gymCodeId) {
  const id = String(gymCodeId || '').trim();
  const list = Array.isArray(gymCodes) ? gymCodes : [];
  const row = list.find((g) => String(g?.id || '') === id) || null;
  const shiftStartTime = row?.shiftStartTime
    ? String(row.shiftStartTime).trim()
    : (row?.shift_start_time ? String(row.shift_start_time).trim() : null);
  const shiftTimezone = String(row?.shiftTimezone || row?.shift_timezone || 'IST').trim() || 'IST';
  return { shiftStartTime: shiftStartTime || null, shiftTimezone };
}
