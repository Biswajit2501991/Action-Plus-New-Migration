import { describe, it, expect } from 'vitest';
import {
  financeMonthBoundsFromKey,
  lastFourMonthTrendSlots,
  parseFinanceMonthKey,
} from '../src/features/finance/financeMonthScope.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

describe('parseFinanceMonthKey', () => {
  it('parses YYYY-MM', () => {
    expect(parseFinanceMonthKey('2026-05')).toEqual({ year: 2026, month: 5 });
  });

  it('rejects invalid keys', () => {
    expect(parseFinanceMonthKey('')).toBeNull();
    expect(parseFinanceMonthKey('bad')).toBeNull();
  });
});

describe('financeMonthBoundsFromKey', () => {
  it('returns May 2026 bounds', () => {
    const b = financeMonthBoundsFromKey('2026-05', MONTHS);
    expect(b.from).toBe('2026-05-01');
    expect(b.to).toBe('2026-05-31');
    expect(b.label).toBe('May 2026');
    expect(b.monthKey).toBe('2026-05');
  });
});

describe('lastFourMonthTrendSlots', () => {
  it('ends at selected month, not today', () => {
    const slots = lastFourMonthTrendSlots('2026-05', MONTHS, () => new Date('2026-06-15'));
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.monthKey)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05']);
    expect(slots[3].label).toBe('May');
  });

  it('rolls year when crossing January', () => {
    const slots = lastFourMonthTrendSlots('2026-02', MONTHS);
    expect(slots.map((s) => s.monthKey)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
