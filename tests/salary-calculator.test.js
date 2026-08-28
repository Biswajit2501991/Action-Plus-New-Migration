import { describe, expect, it } from 'vitest';
import {
  calculateExpectedDailyMinutes,
  calculateLateDeductionMinutes,
  calculateStaffMonthlySalary,
  isoToMinutes,
  minutesToDisplayTime,
  timeStrToMinutes,
} from '../backend/src/services/salary/salaryCalculatorService.js';

describe('Salary Calculator Unit Tests', () => {
  it('parses time strings to minutes and formats back', () => {
    expect(timeStrToMinutes('06:30')).toBe(390);
    expect(timeStrToMinutes('11:00')).toBe(660);
    expect(timeStrToMinutes('17:00')).toBe(1020);
    expect(timeStrToMinutes('20:00')).toBe(1200);
    expect(timeStrToMinutes('invalid')).toBeNull();

    expect(minutesToDisplayTime(390)).toBe('06:30 AM');
    expect(minutesToDisplayTime(1020)).toBe('05:00 PM');
    expect(minutesToDisplayTime(1290)).toBe('09:30 PM');
  });

  it('calculates expected daily minutes for split and single shifts', () => {
    // Raja split: 6:30 to 11:00 (4.5h = 270m) + 5:00 PM to 8:00 PM (3h = 180m) = 450m
    const rajaProfile = {
      shiftMode: 'split',
      shift1Start: '06:30',
      shift1End: '11:00',
      shift2Start: '17:00',
      shift2End: '20:00',
    };
    expect(calculateExpectedDailyMinutes(rajaProfile)).toBe(450);

    // Evening only full day: 4:30 PM to 9:30 PM (5h = 300m)
    const eveningProfile = {
      shiftMode: 'single_evening',
      shift1Start: '16:30',
      shift1End: '21:30',
      shift2Start: null,
      shift2End: null,
    };
    expect(calculateExpectedDailyMinutes(eveningProfile)).toBe(300);
  });

  it('calculates late deduction minutes in 15-minute slabs', () => {
    const shiftStart = 390; // 06:30 AM
    const grace = 15; // grace till 06:45 AM (405m)
    const step = 15;

    // 1. On time: 06:38 AM (398m) -> 0 late
    const onTime = calculateLateDeductionMinutes(398, shiftStart, grace, step);
    expect(onTime.isLate).toBe(false);
    expect(onTime.deductedMinutes).toBe(0);

    // 2. Exact grace limit: 06:45 AM (405m) -> 0 late
    const atGrace = calculateLateDeductionMinutes(405, shiftStart, grace, step);
    expect(atGrace.isLate).toBe(false);
    expect(atGrace.deductedMinutes).toBe(0);

    // 3. 7 mins past grace: 06:52 AM (412m) -> 1st 15m slab -> 15 min deducted
    const late1 = calculateLateDeductionMinutes(412, shiftStart, grace, step);
    expect(late1.isLate).toBe(true);
    expect(late1.deductedMinutes).toBe(15);

    // 4. Exactly 7:00 AM (420m) -> 15m past grace -> 1st 15m slab -> 15 min deducted
    const late2 = calculateLateDeductionMinutes(420, shiftStart, grace, step);
    expect(late2.isLate).toBe(true);
    expect(late2.deductedMinutes).toBe(15);

    // 5. 7:10 AM (430m) -> 25m past grace -> 2nd 15m slab -> 30 min deducted
    const late3 = calculateLateDeductionMinutes(430, shiftStart, grace, step);
    expect(late3.isLate).toBe(true);
    expect(late3.deductedMinutes).toBe(30);
  });

  it('handles 2-day monthly note exemption policy and 3rd day deduction', () => {
    const staffUser = { id: 'Raja', name: 'Raja Trainer' };
    const profile = {
      staffLoginId: 'Raja',
      monthlySalary: 31000, // 31 days in Aug -> 1000/day. Daily min = 450m -> ~2.222/min
      shiftMode: 'split',
      shift1Start: '06:30',
      shift1End: '11:00',
      shift2Start: '17:00',
      shift2End: '20:00',
      graceMinutes: 15,
      lateStepMinutes: 15,
      monthlyNoteExemptions: 2,
      weeklyOffDays: ['Sunday'],
    };

    // 3 Late days in August 2026:
    // Aug 3 (Mon): 06:55 AM (10m past grace = 15m late), has Note
    // Aug 4 (Tue): 06:55 AM (10m past grace = 15m late), has Note
    // Aug 5 (Wed): 06:55 AM (10m past grace = 15m late), has Note
    // Aug 6 (Thu): 06:55 AM (10m past grace = 15m late), NO Note
    const attendanceRecords = [
      { userId: 'Raja', date: '2026-08-03', firstLoginAt: '2026-08-03T01:25:00.000Z' }, // 06:55 AM IST
      { userId: 'Raja', date: '2026-08-04', firstLoginAt: '2026-08-04T01:25:00.000Z' }, // 06:55 AM IST
      { userId: 'Raja', date: '2026-08-05', firstLoginAt: '2026-08-05T01:25:00.000Z' }, // 06:55 AM IST
      { userId: 'Raja', date: '2026-08-06', firstLoginAt: '2026-08-06T01:25:00.000Z' }, // 06:55 AM IST
    ];

    const attendanceNotes = [
      { staffLoginId: 'Raja', attendanceDate: '2026-08-03', noteCategory: 'traffic', note: 'Heavy traffic' },
      { staffLoginId: 'Raja', attendanceDate: '2026-08-04', noteCategory: 'rain', note: 'Heavy rain' },
      { staffLoginId: 'Raja', attendanceDate: '2026-08-05', noteCategory: 'medical', note: 'Doctor visit' },
    ];

    const res = calculateStaffMonthlySalary({
      staffUser,
      profile,
      year: 2026,
      month: 8,
      attendanceRecords,
      attendanceNotes,
      gymHolidays: [],
      leaveRequests: [],
      manualOverrides: [],
      todayDateStr: '2026-08-06', // up to Aug 6
    });

    const day3 = res.dayBreakdown.find((d) => d.date === '2026-08-03');
    const day4 = res.dayBreakdown.find((d) => d.date === '2026-08-04');
    const day5 = res.dayBreakdown.find((d) => d.date === '2026-08-05');
    const day6 = res.dayBreakdown.find((d) => d.date === '2026-08-06');

    // Day 3 (1st note): 0 deduction, exempt 1 of 2
    expect(day3.noteExemptionStatus).toBe('exempt_1_of_2');
    expect(day3.dayDeductionAmount).toBe(0);

    // Day 4 (2nd note): 0 deduction, exempt 2 of 2
    expect(day4.noteExemptionStatus).toBe('exempt_2_of_2');
    expect(day4.dayDeductionAmount).toBe(0);

    // Day 5 (3rd note): limit exceeded -> deduction applied
    expect(day5.noteExemptionStatus).toBe('exempt_limit_exceeded');
    expect(day5.dayDeductionAmount).toBeGreaterThan(0);

    // Day 6 (no note): deduction applied
    expect(day6.noteExemptionStatus).toBe('no_note');
    expect(day6.dayDeductionAmount).toBeGreaterThan(0);
  });

  it('supports owner manual waiver on 3rd late day with note', () => {
    const staffUser = { id: 'Raja', name: 'Raja Trainer' };
    const profile = {
      staffLoginId: 'Raja',
      monthlySalary: 31000,
      shiftMode: 'split',
      shift1Start: '06:30',
      shift1End: '11:00',
      shift2Start: '17:00',
      shift2End: '20:00',
      graceMinutes: 15,
      monthlyNoteExemptions: 2,
    };

    const attendanceRecords = [
      { userId: 'Raja', date: '2026-08-03', firstLoginAt: '2026-08-03T01:25:00.000Z' },
      { userId: 'Raja', date: '2026-08-04', firstLoginAt: '2026-08-04T01:25:00.000Z' },
      { userId: 'Raja', date: '2026-08-05', firstLoginAt: '2026-08-05T01:25:00.000Z' },
    ];
    const attendanceNotes = [
      { staffLoginId: 'Raja', attendanceDate: '2026-08-03', noteCategory: 'traffic', note: 'Heavy traffic' },
      { staffLoginId: 'Raja', attendanceDate: '2026-08-04', noteCategory: 'rain', note: 'Heavy rain' },
      { staffLoginId: 'Raja', attendanceDate: '2026-08-05', noteCategory: 'medical', note: 'Doctor visit' },
    ];

    // Owner waives Day 5
    const manualOverrides = [
      { staffLoginId: 'Raja', date: '2026-08-05', status: 'waived', reason: 'Owner approved valid medical cert' },
    ];

    const res = calculateStaffMonthlySalary({
      staffUser,
      profile,
      year: 2026,
      month: 8,
      attendanceRecords,
      attendanceNotes,
      gymHolidays: [],
      leaveRequests: [],
      manualOverrides,
      todayDateStr: '2026-08-05',
    });

    const day5 = res.dayBreakdown.find((d) => d.date === '2026-08-05');
    expect(day5.overrideStatus).toBe('waived');
    expect(day5.dayDeductionAmount).toBe(0);
    expect(res.totalLatenessDeductionAmount).toBe(0);
  });

  it('supports single shift evening staff (4:30 PM to 9:30 PM)', () => {
    const staffUser = { id: 'Pooja', name: 'Pooja Frontdesk' };
    const profile = {
      staffLoginId: 'Pooja',
      monthlySalary: 20000,
      shiftMode: 'single_evening',
      shift1Start: '16:30',
      shift1End: '21:30',
      shift2Start: null,
      shift2End: null,
      graceMinutes: 15, // till 16:45 (4:45 PM)
    };

    // Punches at 16:35 (4:35 PM IST = 11:05 UTC) -> On Time
    const attendanceRecords = [
      { userId: 'Pooja', date: '2026-08-01', firstLoginAt: '2026-08-01T11:05:00.000Z' },
    ];

    const res = calculateStaffMonthlySalary({
      staffUser,
      profile,
      year: 2026,
      month: 8,
      attendanceRecords,
      attendanceNotes: [],
      gymHolidays: [],
      leaveRequests: [],
      manualOverrides: [],
      todayDateStr: '2026-08-01',
    });

    const day1 = res.dayBreakdown.find((d) => d.date === '2026-08-01');
    expect(day1.shift1PunchTime).toBe('04:35 PM');
    expect(day1.shift1DeductedMinutes).toBe(0);
    expect(day1.dayDeductionAmount).toBe(0);
    expect(day1.shift2ExpectedStart).toBeNull();
  });

  it('persists and retrieves staff salary profile, holidays and manual overrides', async () => {
    const { query } = await import('../backend/src/db/adapter.js');
    await query(`
      create table if not exists app_kv (
        key text primary key,
        value_json text not null,
        updated_at text not null
      )
    `);

    const {
      saveStaffSalaryProfile,
      getStaffSalarySettings,
      saveGymHoliday,
      saveSalaryManualOverride,
    } = await import('../backend/src/services/salary/salaryCalculatorService.js');

    await saveStaffSalaryProfile('raja', {
      monthlySalary: 30000,
      shiftMode: 'split',
      shift1Start: '06:30',
      shift1End: '11:00',
    });

    await saveGymHoliday({
      date: '2026-08-15',
      name: 'Independence Day',
      isPaid: true,
    });

    await saveSalaryManualOverride({
      staffLoginId: 'raja',
      date: '2026-08-05',
      status: 'waived',
      reason: 'Owner approved doctor visit',
    });

    const settings = await getStaffSalarySettings();
    expect(settings.profiles).toBeDefined();
    expect(settings.profiles.raja?.monthlySalary).toBe(30000);
    expect(settings.holidays.some((h) => h.date === '2026-08-15')).toBe(true);
    expect(settings.overrides.some((o) => o.staffLoginId === 'raja' && o.date === '2026-08-05')).toBe(true);
  });
});
