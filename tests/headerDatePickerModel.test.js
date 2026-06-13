import { describe, expect, it } from 'vitest';
import {
  buildMonthGridCells,
  formatHeaderDateButtonLabel,
  parseCalendarDateKey,
  toCalendarDateKey,
  viewFromDateKey,
} from '../src/features/overlay/headerDatePickerModel.js';

describe('headerDatePickerModel', () => {
  it('parses and formats calendar date keys', () => {
    const date = parseCalendarDateKey('2026-06-13');
    expect(date).not.toBeNull();
    expect(toCalendarDateKey(date)).toBe('2026-06-13');
  });

  it('formats header button labels', () => {
    expect(formatHeaderDateButtonLabel('2026-06-13', { showYear: true, showIcon: true }))
      .toBe('🗓 13/Jun/2026');
    expect(formatHeaderDateButtonLabel('2026-06-13', { showYear: false }))
      .toBe('13/Jun');
  });

  it('builds a 42-cell month grid with selected and today flags', () => {
    const cells = buildMonthGridCells(2026, 5, '2026-06-13', '2026-06-11');
    expect(cells).toHaveLength(42);
    const selected = cells.find((c) => c.isSelected);
    const today = cells.find((c) => c.isToday);
    expect(selected?.dateKey).toBe('2026-06-13');
    expect(today?.dateKey).toBe('2026-06-11');
  });

  it('derives view month from value', () => {
    expect(viewFromDateKey('2026-06-13')).toEqual({ year: 2026, month: 5 });
  });
});
