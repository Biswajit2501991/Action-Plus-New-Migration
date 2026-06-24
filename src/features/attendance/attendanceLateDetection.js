/**
 * Compare first login ISO timestamp against branch shift start (HH:MM).
 * @param {string|Date|null|undefined} firstLoginAtIso
 * @param {string|null|undefined} shiftStartTime - "HH:MM" or "HH:MM:SS"
 * @param {{ graceMinutes?: number }} [options]
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
  const login = new Date(loginMs);
  const shiftStart = new Date(login);
  shiftStart.setHours(hours, minutes, 0, 0);
  const graceMs = Math.max(0, Number(options.graceMinutes) || 0) * 60 * 1000;
  return loginMs > shiftStart.getTime() + graceMs;
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
