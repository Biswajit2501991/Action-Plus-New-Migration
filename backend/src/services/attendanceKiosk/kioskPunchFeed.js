/** In-memory recent punches for kiosk display feedback (per branch). */

const MAX_PER_BRANCH = 12;
/** @type {Map<string, Array<object>>} */
const byBranch = new Map();

export function recordKioskPunch(branchId, entry) {
  const key = String(branchId || '').trim();
  if (!key) return;
  const list = byBranch.get(key) || [];
  list.unshift({
    at: entry.at || new Date().toISOString(),
    staffName: String(entry.staffName || entry.userId || 'Staff'),
    userId: String(entry.userId || ''),
    punchType: entry.punchType === 'logout' ? 'logout' : 'login',
    method: String(entry.method || 'qr'),
  });
  byBranch.set(key, list.slice(0, MAX_PER_BRANCH));
}

export function listRecentKioskPunches(branchId, limit = 8) {
  const key = String(branchId || '').trim();
  const list = byBranch.get(key) || [];
  return list.slice(0, Math.max(1, Number(limit) || 8));
}

/** Test helper */
export function clearKioskPunchFeed() {
  byBranch.clear();
}
