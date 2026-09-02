import { describe, expect, it } from 'vitest';
import {
  evaluateWorkoutPlanScheduleWindow,
  formatIstYmd,
  normalizePortalWorkoutPlanDate,
  workoutPlanScheduleStatusLabel,
} from '../src/shared/portalWorkoutPlanSchedule.js';

describe('portalWorkoutPlanSchedule', () => {
  it('normalizes YYYY-MM-DD dates', () => {
    expect(normalizePortalWorkoutPlanDate('2026-09-01')).toBe('2026-09-01');
    expect(normalizePortalWorkoutPlanDate('2026-09-01T00:00:00Z')).toBe('2026-09-01');
    expect(normalizePortalWorkoutPlanDate('')).toBe(null);
    expect(normalizePortalWorkoutPlanDate(null)).toBe(null);
  });

  it('allows visibility when no schedule is set', () => {
    expect(evaluateWorkoutPlanScheduleWindow({})).toEqual({ ok: true, reason: null });
    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledFrom: null,
        enabledUntil: null,
        todayYmd: '2026-09-15',
      }),
    ).toEqual({ ok: true, reason: null });
  });

  it('blocks before start date and after end date', () => {
    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledFrom: '2026-09-01',
        enabledUntil: '2026-09-30',
        todayYmd: '2026-08-31',
      }),
    ).toEqual({ ok: false, reason: 'date_not_started' });

    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledFrom: '2026-09-01',
        enabledUntil: '2026-09-30',
        todayYmd: '2026-09-01',
      }),
    ).toEqual({ ok: true, reason: null });

    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledFrom: '2026-09-01',
        enabledUntil: '2026-09-30',
        todayYmd: '2026-09-30',
      }),
    ).toEqual({ ok: true, reason: null });

    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledFrom: '2026-09-01',
        enabledUntil: '2026-09-30',
        todayYmd: '2026-10-01',
      }),
    ).toEqual({ ok: false, reason: 'date_expired' });
  });

  it('supports open-ended until-only schedules', () => {
    expect(
      evaluateWorkoutPlanScheduleWindow({
        enabledUntil: '2026-09-30',
        todayYmd: '2026-10-01',
      }),
    ).toEqual({ ok: false, reason: 'date_expired' });
  });

  it('formats IST calendar dates', () => {
    const ymd = formatIstYmd(new Date('2026-09-01T18:30:00.000Z'));
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('builds human-readable schedule status labels', () => {
    expect(
      workoutPlanScheduleStatusLabel({
        enabledFrom: '2026-09-01',
        enabledUntil: '2026-09-30',
        todayYmd: '2026-09-15',
      }),
    ).toBe('Active 2026-09-01 – 2026-09-30');

    expect(
      workoutPlanScheduleStatusLabel({
        enabledUntil: '2026-09-30',
        todayYmd: '2026-10-01',
      }),
    ).toBe('Expired on 2026-09-30');
  });
});
