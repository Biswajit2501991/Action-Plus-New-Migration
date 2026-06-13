export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Parse YYYY-MM-DD into a local calendar Date (no timezone shift). */
export function parseCalendarDateKey(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Format a local Date as YYYY-MM-DD. */
export function toCalendarDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localTodayCalendarKey(now = new Date()) {
  return toCalendarDateKey(now);
}

export function addMonths(year, month, delta) {
  const base = new Date(year, month + (Number(delta) || 0), 1);
  return { year: base.getFullYear(), month: base.getMonth() };
}

export function viewFromDateKey(value) {
  const date = parseCalendarDateKey(value) || new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function formatHeaderDateButtonLabel(value, options = {}) {
  const { showYear = true, showIcon = false } = options;
  const date = parseCalendarDateKey(value);
  if (!date) return showYear ? '--/---/----' : '--/---';
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = (MONTH_SHORT[date.getMonth()] || '').slice(0, 3);
  const label = showYear ? `${dd}/${mon}/${date.getFullYear()}` : `${dd}/${mon}`;
  return showIcon ? `🗓 ${label}` : label;
}

/**
 * Build a 6×7 month grid (Sunday-first) for the anchored header date picker.
 * @param {number} viewYear
 * @param {number} viewMonth 0–11
 * @param {string} selectedKey YYYY-MM-DD
 * @param {string} todayKey YYYY-MM-DD
 */
export function buildMonthGridCells(viewYear, viewMonth, selectedKey = '', todayKey = '') {
  const first = new Date(viewYear, viewMonth, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    let day;
    let year = viewYear;
    let month = viewMonth;
    let inMonth = true;

    if (i < startPad) {
      const prev = addMonths(viewYear, viewMonth, -1);
      year = prev.year;
      month = prev.month;
      day = prevMonthDays - startPad + i + 1;
      inMonth = false;
    } else if (i < startPad + daysInMonth) {
      day = i - startPad + 1;
    } else {
      const next = addMonths(viewYear, viewMonth, 1);
      year = next.year;
      month = next.month;
      day = i - startPad - daysInMonth + 1;
      inMonth = false;
    }

    const dateKey = toCalendarDateKey(new Date(year, month, day));
    cells.push({
      key: `${dateKey}-${i}`,
      dateKey,
      day,
      inMonth,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedKey,
    });
  }

  return cells;
}
