/** YYYY-MM-DD in local calendar (matches legacy index.html). */
export function localCalendarDateKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const dt = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localTodayCalendarKey(): string {
  return localCalendarDateKey(new Date());
}

export function formatDisplayDate(value: unknown): string {
  const key = localCalendarDateKey(value);
  if (!key) return '-';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
