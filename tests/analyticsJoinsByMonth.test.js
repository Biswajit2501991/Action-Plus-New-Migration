import { describe, it, expect } from 'vitest';

/** Mirrors analytics joins-by-month window filter (display-only). */
function lastNMonthKeys(through, n = 12) {
  const parts = String(through || '').split('-').map(Number);
  let y = parts[0];
  let m = parts[1];
  if (!y || !m) return [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

function buildJoinsByMonth(joiningDates, through = '2026-07') {
  const allowed = new Set(lastNMonthKeys(through, 12));
  const map = {};
  for (const rawFull of joiningDates) {
    const raw = String(rawFull || '').slice(0, 7);
    if (!allowed.has(raw)) continue;
    map[raw] = (map[raw] || 0) + 1;
  }
  return [...allowed]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => ({ month, count: map[month] || 0 }));
}

describe('analytics joins by month', () => {
  it('excludes future typo months like 2044-07 from the chart window', () => {
    const rows = buildJoinsByMonth(['2026-07-01', '2026-06-15', '2044-07-01'], '2026-07');
    expect(rows.some((r) => r.month === '2044-07')).toBe(false);
    expect(rows.find((r) => r.month === '2026-07')?.count).toBe(1);
    expect(rows.find((r) => r.month === '2026-06')?.count).toBe(1);
    expect(rows).toHaveLength(12);
  });
});
