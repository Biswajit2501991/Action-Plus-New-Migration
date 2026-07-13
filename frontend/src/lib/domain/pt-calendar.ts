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

/**
 * Build Sun-first calendar grid cells for PT Workout Scheduler (UTC calendar dates).
 */
export function buildPtMonthCalendarCells(
  year: number,
  monthIndex: number,
  focusByDate: Record<string, string> = {},
): PtCalendarCell[] {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();
  const leadingPad = monthStart.getUTCDay();
  const cells: PtCalendarCell[] = [];

  for (let i = 0; i < leadingPad; i += 1) {
    cells.push({ kind: "pad", key: `pad-start-${year}-${monthIndex}-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dt = new Date(Date.UTC(year, monthIndex, day));
    const key = dt.toISOString().slice(0, 10);
    const isSunday = dt.getUTCDay() === 0;
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
