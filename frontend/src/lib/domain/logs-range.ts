/** Audit Logs date-window helpers — server fetch scopes, not client-only filters. */

export type LogsRangePreset = "24h" | "7d" | "30d" | "custom";

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const LOGS_CUSTOM_MAX_DAYS = 90;
/** Soft cap per window — enough for a busy gym week/month without loading years. */
export const LOGS_RANGE_FETCH_LIMIT = 5000;

export type LogsFetchRange = {
  startDate: string;
  endDate: string;
  preset: LogsRangePreset;
};

function addCalendarDays(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return isoDate(dt);
}

/** Inclusive calendar span in days (same start/end = 1). */
export function logsRangeSpanDays(startDate: string, endDate: string): number {
  const a = String(startDate || "").slice(0, 10);
  const b = String(endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const start = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function validateLogsCustomRange(startDate: string, endDate: string): string | null {
  const start = String(startDate || "").slice(0, 10);
  const end = String(endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return "Choose a valid start and end date.";
  }
  if (start > end) return "Start date must be on or before end date.";
  if (logsRangeSpanDays(start, end) > LOGS_CUSTOM_MAX_DAYS) {
    return `Custom range cannot exceed ${LOGS_CUSTOM_MAX_DAYS} days.`;
  }
  return null;
}

/** Default Logs window: last 7 calendar days inclusive (today − 6 → today). */
export function defaultLogsFetchRange(now = new Date()): LogsFetchRange {
  const endDate = isoDate(now);
  return {
    preset: "7d",
    startDate: addCalendarDays(endDate, -6),
    endDate,
  };
}

export function resolveLogsFetchRange(
  preset: LogsRangePreset,
  custom?: { start: string; end: string },
  now = new Date(),
): LogsFetchRange {
  if (preset === "24h") {
    const end = now;
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      preset: "24h",
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }
  if (preset === "30d") {
    const endDate = isoDate(now);
    return {
      preset: "30d",
      startDate: addCalendarDays(endDate, -29),
      endDate,
    };
  }
  if (preset === "custom") {
    const start = String(custom?.start || "").slice(0, 10);
    const end = String(custom?.end || "").slice(0, 10);
    return {
      preset: "custom",
      startDate: start,
      endDate: end,
    };
  }
  return defaultLogsFetchRange(now);
}

export function logsRangeLabel(range: LogsFetchRange): string {
  if (range.preset === "24h") return "Last 24 hours";
  if (range.preset === "7d") return "Last 7 days";
  if (range.preset === "30d") return "Last 30 days";
  const a = String(range.startDate || "").slice(0, 10);
  const b = String(range.endDate || "").slice(0, 10);
  return a && b ? `${a} → ${b}` : "Custom range";
}
