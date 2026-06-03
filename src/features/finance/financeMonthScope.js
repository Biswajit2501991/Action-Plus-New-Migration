/**
 * Reporting month helpers for Finance (YYYY-MM selector).
 */

export function parseFinanceMonthKey(financeMonth) {
  const parts = String(financeMonth || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDateLocal(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Last day of calendar month (month is 1–12). */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {string} financeMonth YYYY-MM
 * @param {string[]} monthLabels e.g. MONTHS from UI
 * @param {() => Date} [nowFn]
 */
export function financeMonthBoundsFromKey(financeMonth, monthLabels, nowFn = () => new Date()) {
  const parsed = parseFinanceMonthKey(financeMonth);
  if (!parsed) {
    const n = nowFn();
    const y = n.getFullYear();
    const m = n.getMonth() + 1;
    return {
      from: isoDateLocal(y, m, 1),
      to: isoDateLocal(y, m, lastDayOfMonth(y, m)),
      label: `${monthLabels[n.getMonth()] || ''} ${y}`.trim(),
      monthKey: `${y}-${pad2(m)}`,
    };
  }
  const { year, month } = parsed;
  return {
    from: isoDateLocal(year, month, 1),
    to: isoDateLocal(year, month, lastDayOfMonth(year, month)),
    label: `${monthLabels[month - 1] || ''} ${year}`.trim(),
    monthKey: `${year}-${pad2(month)}`,
  };
}

/**
 * Four trend slots ending at the selected reporting month (not rolling from today).
 * @returns {{ label: string, monthKey: string }[]}
 */
export function lastFourMonthTrendSlots(financeMonth, monthLabels, nowFn = () => new Date()) {
  let year;
  let month;
  const parsed = parseFinanceMonthKey(financeMonth);
  if (parsed) {
    year = parsed.year;
    month = parsed.month;
  } else {
    const n = nowFn();
    year = n.getFullYear();
    month = n.getMonth() + 1;
  }
  const slots = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    let m = month - offset;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const monthKey = `${y}-${pad2(m)}`;
    slots.push({
      label: monthLabels[m - 1] || monthKey,
      monthKey,
    });
  }
  return slots;
}
