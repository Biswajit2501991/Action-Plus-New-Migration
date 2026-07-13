export type PtCalendarCell =
  | { kind: "pad"; key: string }
  | {
      kind: "day";
      day: number;
      key: string;
      isSunday: boolean;
      hasFocus: boolean;
      focus: string;
    };

/** Parse YYYY-MM-DD into local calendar parts (matches isoDate / Workout Date input). */
export function parsePtDateKey(dateKey: string | Date | null | undefined): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  if (!dateKey) return null;
  if (typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateKey)) {
    const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return { year: y, monthIndex: m - 1, day: d };
  }
  const dt = dateKey instanceof Date ? dateKey : new Date(dateKey);
  if (Number.isNaN(dt.getTime())) return null;
  return { year: dt.getFullYear(), monthIndex: dt.getMonth(), day: dt.getDate() };
}

export function ptDateKeyFromParts(year: number, monthIndex: number, day: number) {
  const dt = new Date(year, monthIndex, day);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build Sun-first calendar grid cells for PT Workout Scheduler.
 * Uses local calendar dates so cells match Workout Date + focusByDate keys.
 */
export function buildPtMonthCalendarCells(
  year: number,
  monthIndex: number,
  focusByDate: Record<string, string> = {},
): PtCalendarCell[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingPad = new Date(year, monthIndex, 1).getDay();
  const cells: PtCalendarCell[] = [];

  for (let i = 0; i < leadingPad; i += 1) {
    cells.push({ kind: "pad", key: `pad-start-${year}-${monthIndex}-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = ptDateKeyFromParts(year, monthIndex, day);
    const isSunday = new Date(year, monthIndex, day).getDay() === 0;
    const focus = String(focusByDate[key] || "").trim();
    cells.push({
      kind: "day",
      day,
      key,
      isSunday,
      hasFocus: Boolean(focus),
      focus,
    });
  }

  return cells;
}
