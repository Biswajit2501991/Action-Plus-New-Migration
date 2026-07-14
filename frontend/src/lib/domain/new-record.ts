/** True when timestamp is within the last `hours` (prod NewRecordBadge default 48). */
export function isRecordNewWithinHours(timestamp?: string | Date | null, hours = 48) {
  if (!timestamp) return false;
  const ms =
    timestamp instanceof Date ? timestamp.getTime() : new Date(String(timestamp)).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const windowMs = (Number(hours) > 0 ? Number(hours) : 48) * 60 * 60 * 1000;
  return Date.now() - ms < windowMs;
}
