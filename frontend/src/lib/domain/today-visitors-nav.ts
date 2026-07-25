import type { Visitor } from "@/types";

/** Calendar YYYY-MM-DD in a timezone (default India). */
export function calendarDateKeyInTimeZone(
  value?: string | Date | null,
  timeZone = "Asia/Kolkata",
): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Count visitors created today (IST by default).
 * Includes website, QR, and manually added — any intake source.
 * Read-only; does not touch staff_seen_* or visitor rows.
 */
export function countVisitorsCreatedToday(
  visitors: Visitor[],
  options?: { timeZone?: string; now?: Date },
): number {
  const timeZone = options?.timeZone || "Asia/Kolkata";
  const today = calendarDateKeyInTimeZone(options?.now || new Date(), timeZone);
  if (!today) return 0;
  let n = 0;
  for (const v of visitors) {
    const key = calendarDateKeyInTimeZone(
      v.addedAt || v.visitDate || null,
      timeZone,
    );
    if (key && key === today) n += 1;
  }
  return n;
}

/** Nav suffix like "(2V)"; empty when none today. */
export function formatTodayVisitorsNavSuffix(count: number): string {
  if (!count || count < 1) return "";
  return `(${count}V)`;
}
