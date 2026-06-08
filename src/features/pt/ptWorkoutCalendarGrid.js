/**
 * Build Sun-first calendar grid cells for PT Workout Scheduler (UTC calendar dates).
 * @param {number} year full year
 * @param {number} monthIndex 0-based month
 * @param {Record<string, string>} [focusByDate] YYYY-MM-DD -> focus label
 */
export function buildPtMonthCalendarCells(year, monthIndex, focusByDate = {}) {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();
  const leadingPad = monthStart.getUTCDay();
  const cells = [];

  for (let i = 0; i < leadingPad; i += 1) {
    cells.push({ kind: 'pad', key: `pad-start-${year}-${monthIndex}-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dt = new Date(Date.UTC(year, monthIndex, day));
    const key = dt.toISOString().slice(0, 10);
    const isSunday = dt.getUTCDay() === 0;
    const focus = String(focusByDate[key] || '').trim();
    cells.push({
      kind: 'day',
      day,
      key,
      isSunday,
      hasFocus: Boolean(focus),
      focus,
    });
  }

  return cells;
}

/** Grid column (0=Sun … 6=Sat) for a day number in the built cell list. */
export function ptCalendarColumnForDay(cells, dayNum) {
  const idx = cells.findIndex((c) => c.kind === 'day' && c.day === dayNum);
  return idx >= 0 ? idx % 7 : -1;
}
