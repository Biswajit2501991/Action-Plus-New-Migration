/** YYYY-MM-DD calendar key (aligned with index.html localCalendarDateKey). */
export function toCalendarDateKey(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True when a reminder was already sent for the member's current billing date.
 * Staff are blocked only for the current cycle; a newer billing date re-enables Reminder.
 */
export function reminderSentForCurrentBilling(member) {
  const sentRaw = member?.reminderSentAt;
  if (!sentRaw) return false;
  const billingKey = toCalendarDateKey(member?.billingDate || '');
  if (!billingKey) return true;
  const sentKey = toCalendarDateKey(sentRaw);
  if (!sentKey) return true;
  return sentKey >= billingKey;
}
