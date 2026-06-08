import { describe, expect, it } from 'vitest';
import {
  buildPtMonthCalendarCells,
  ptCalendarColumnForDay,
} from '../src/features/pt/ptWorkoutCalendarGrid.js';

describe('buildPtMonthCalendarCells', () => {
  it('aligns June 2026 with Monday the 1st under Mon column', () => {
    const cells = buildPtMonthCalendarCells(2026, 5);
    expect(cells[0].kind).toBe('pad');
    expect(cells[1]).toMatchObject({ kind: 'day', day: 1, key: '2026-06-01' });
    expect(ptCalendarColumnForDay(cells, 1)).toBe(1);
    expect(ptCalendarColumnForDay(cells, 8)).toBe(1);
    expect(ptCalendarColumnForDay(cells, 7)).toBe(0);
  });

  it('handles February 2024 leap year (1st is Thursday)', () => {
    const cells = buildPtMonthCalendarCells(2024, 1);
    expect(cells.filter((c) => c.kind === 'day')).toHaveLength(29);
    expect(ptCalendarColumnForDay(cells, 1)).toBe(4);
  });

  it('handles February 2025 (1st is Saturday)', () => {
    const cells = buildPtMonthCalendarCells(2025, 1);
    expect(ptCalendarColumnForDay(cells, 1)).toBe(6);
  });
});
