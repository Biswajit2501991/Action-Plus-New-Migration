import { readJsonValue, writeJsonValue, useSupabase } from '../../db/dataStore.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { T } from '../../db/tables.js';

export const STORE_KEY_SALARY_CONFIG = 'apg.staff_salary_configs';
export const STORE_KEY_HOLIDAYS = 'apg.gym_holidays';
export const STORE_KEY_OVERRIDES = 'apg.salary_manual_overrides';

export const DEFAULT_SHIFT_MODE = 'split';
export const DEFAULT_GRACE_MINUTES = 15;
export const DEFAULT_LATE_STEP_MINUTES = 15;
export const DEFAULT_MONTHLY_NOTE_EXEMPTIONS = 2;
export const DEFAULT_WEEKLY_OFF_DAYS = ['Sunday'];

/**
 * Default shift timings for common gym presets.
 */
export const SHIFT_PRESETS = {
  split: {
    label: 'Split Shift (Morning + Evening)',
    shift1Start: '06:30',
    shift1End: '11:00',
    shift2Start: '17:00',
    shift2End: '20:00',
  },
  single_evening: {
    label: 'Single Shift (Evening Full Day, e.g. 4:30 PM – 9:30 PM)',
    shift1Start: '16:30',
    shift1End: '21:30',
    shift2Start: null,
    shift2End: null,
  },
  single_morning: {
    label: 'Single Shift (Morning Full Day, e.g. 6:00 AM – 2:00 PM)',
    shift1Start: '06:00',
    shift1End: '14:00',
    shift2Start: null,
    shift2End: null,
  },
  custom: {
    label: 'Custom Shift Timings',
    shift1Start: '06:30',
    shift1End: '11:00',
    shift2Start: '17:00',
    shift2End: '20:00',
  },
};

/**
 * Parse HH:MM (or H:MM) into minutes from midnight (0..1439).
 */
export function timeStrToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

/**
 * Format ISO or Date timestamp to minutes from midnight in Asia/Kolkata (or specified timeZone).
 */
export function isoToMinutes(isoString, timeZone = 'Asia/Kolkata') {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minPart = parts.find((p) => p.type === 'minute')?.value;
    if (!hourPart || !minPart) return null;
    const hours = parseInt(hourPart, 10);
    const mins = parseInt(minPart, 10);
    return hours * 60 + mins;
  } catch {
    return null;
  }
}

/**
 * Format minutes from midnight to 12h readable string (e.g. 390 -> "06:30 AM").
 */
export function minutesToDisplayTime(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours12)}:${pad(mins)} ${period}`;
}

/**
 * Format YYYY-MM-DD date to Day of Week name (e.g. "Sunday", "Monday").
 */
export function getDayOfWeekName(dateStr, timeZone = 'Asia/Kolkata') {
  try {
    const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(d);
  } catch {
    return 'Sunday';
  }
}

/**
 * Generate list of all YYYY-MM-DD dates in a given month (year, month: 1-12).
 */
export function getDaysInMonthList(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const count = new Date(y, m, 0).getDate();
  const list = [];
  const pad = (n) => String(n).padStart(2, '0');
  for (let d = 1; d <= count; d += 1) {
    list.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  return list;
}

/**
 * Calculate expected daily working minutes for a staff profile.
 */
export function calculateExpectedDailyMinutes(profile) {
  if (profile?.customDailyHours && profile.customDailyHours > 0) {
    return Math.round(profile.customDailyHours * 60);
  }
  const s1Start = timeStrToMinutes(profile?.shift1Start || '06:30');
  const s1End = timeStrToMinutes(profile?.shift1End || '11:00');
  let shift1Minutes = 0;
  if (s1Start != null && s1End != null && s1End > s1Start) {
    shift1Minutes = s1End - s1Start;
  }

  let shift2Minutes = 0;
  if (profile?.shiftMode === 'split' || (profile?.shift2Start && profile?.shift2End)) {
    const s2Start = timeStrToMinutes(profile?.shift2Start);
    const s2End = timeStrToMinutes(profile?.shift2End);
    if (s2Start != null && s2End != null && s2End > s2Start) {
      shift2Minutes = s2End - s2Start;
    }
  }

  const total = shift1Minutes + shift2Minutes;
  return total > 0 ? total : 480; // default 8h (480 mins) if unspecified
}

/**
 * Calculate late slab minutes (15 min increments).
 * e.g. grace = 15m;
 * if actual punch is <= shiftStart + grace -> 0 min late.
 * if actual punch is shiftStart + 20m -> 5m past grace -> 1st 15-min slab -> 15 min deducted.
 * if actual punch is shiftStart + 40m -> 25m past grace -> 2nd 15-min slab -> 30 min deducted.
 */
export function calculateLateDeductionMinutes(
  punchMinutes,
  shiftStartMinutes,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  stepMinutes = DEFAULT_LATE_STEP_MINUTES,
) {
  if (punchMinutes == null || shiftStartMinutes == null) return { rawLateMinutes: 0, deductedMinutes: 0, isLate: false };
  const diff = punchMinutes - shiftStartMinutes;
  if (diff <= graceMinutes) {
    return { rawLateMinutes: Math.max(0, diff), deductedMinutes: 0, isLate: false };
  }
  const minutesPastGrace = diff - graceMinutes;
  const slabs = Math.ceil(minutesPastGrace / stepMinutes);
  const deductedMinutes = slabs * stepMinutes;
  return {
    rawLateMinutes: diff,
    minutesPastGrace,
    deductedMinutes,
    isLate: true,
  };
}

/**
 * Core pure function to calculate a staff member's monthly salary and day-by-day attendance breakdown.
 */
export function calculateStaffMonthlySalary({
  staffUser,
  profile,
  year,
  month,
  attendanceRecords = [],
  attendanceNotes = [],
  gymHolidays = [],
  leaveRequests = [],
  manualOverrides = [],
  todayDateStr = new Date().toISOString().slice(0, 10),
}) {
  const staffId = String(staffUser?.id || staffUser?.staffLoginId || profile?.staffLoginId || '').trim();
  const staffName = staffUser?.name || staffUser?.display_name || staffId;
  const monthlySalary = Number(profile?.monthlySalary || 0);

  const daysList = getDaysInMonthList(year, month);
  const totalDaysInMonth = daysList.length;

  const weeklyOffDays = Array.isArray(profile?.weeklyOffDays) && profile.weeklyOffDays.length
    ? profile.weeklyOffDays
    : DEFAULT_WEEKLY_OFF_DAYS;

  const expectedDailyMinutes = calculateExpectedDailyMinutes(profile);
  const dailyWage = totalDaysInMonth > 0 && monthlySalary > 0
    ? monthlySalary / totalDaysInMonth
    : 0;
  const perMinuteRate = expectedDailyMinutes > 0
    ? dailyWage / expectedDailyMinutes
    : 0;

  const s1Start = timeStrToMinutes(profile?.shift1Start || '06:30');
  const s1End = timeStrToMinutes(profile?.shift1End || '11:00');
  const hasShift2 = profile?.shiftMode === 'split' || Boolean(profile?.shift2Start && profile?.shift2End);
  const s2Start = hasShift2 ? timeStrToMinutes(profile?.shift2Start) : null;
  const s2End = hasShift2 ? timeStrToMinutes(profile?.shift2End) : null;
  const graceMinutes = Number(profile?.graceMinutes ?? DEFAULT_GRACE_MINUTES);
  const stepMinutes = Number(profile?.lateStepMinutes ?? DEFAULT_LATE_STEP_MINUTES);
  const maxExemptions = Number(profile?.monthlyNoteExemptions ?? DEFAULT_MONTHLY_NOTE_EXEMPTIONS);

  // Index inputs by date
  const recordsByDate = new Map();
  for (const r of attendanceRecords) {
    if (String(r.userId || r.staffLoginId || '').trim().toLowerCase() === staffId.toLowerCase()) {
      const d = String(r.date || r.attendanceDate || '').slice(0, 10);
      recordsByDate.set(d, r);
    }
  }

  const notesByDate = new Map();
  for (const n of attendanceNotes) {
    if (String(n.staffLoginId || n.staff_login_id || '').trim().toLowerCase() === staffId.toLowerCase()) {
      const d = String(n.attendanceDate || n.attendance_date || '').slice(0, 10);
      notesByDate.set(d, n);
    }
  }

  const holidaysByDate = new Map();
  for (const h of gymHolidays) {
    const d = String(h.date || h.holiday_date || '').slice(0, 10);
    holidaysByDate.set(d, h);
  }

  const overridesByDate = new Map();
  for (const o of manualOverrides) {
    if (String(o.staffLoginId || '').trim().toLowerCase() === staffId.toLowerCase()) {
      const d = String(o.date || '').slice(0, 10);
      overridesByDate.set(d, o);
    }
  }

  let runningNoteExemptionCount = 0;
  let totalPresentDays = 0;
  let totalAbsentDays = 0;
  let totalHolidays = 0;
  let totalWeeklyOffs = 0;
  let totalApprovedLeaves = 0;
  let totalLateDays = 0;
  let totalDeductedLateMinutes = 0;
  let totalLatenessDeductionAmount = 0;
  let totalAbsenceDeductionAmount = 0;
  let totalManualWaiverCount = 0;

  const dayBreakdown = [];

  for (const dateStr of daysList) {
    const dayOfWeek = getDayOfWeekName(dateStr);
    const isFuture = dateStr > todayDateStr;
    const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
    const holiday = holidaysByDate.get(dateStr);
    const record = recordsByDate.get(dateStr);
    const note = notesByDate.get(dateStr);
    const override = overridesByDate.get(dateStr);

    const isLeave = Boolean(
      leaveRequests.find(
        (l) =>
          String(l.userId || l.staffLoginId || '').toLowerCase() === staffId.toLowerCase() &&
          l.status === 'Approved' &&
          dateStr >= String(l.startDate || '').slice(0, 10) &&
          dateStr <= String(l.endDate || '').slice(0, 10),
      ),
    );

    let dayStatus = 'Present';
    let shift1PunchMinutes = null;
    let shift2PunchMinutes = null;
    let shift1Late = { rawLateMinutes: 0, deductedMinutes: 0, isLate: false };
    let shift2Late = { rawLateMinutes: 0, deductedMinutes: 0, isLate: false };
    let dayLateMinutes = 0;
    let noteExemptionStatus = null; // 'exempt_used' | 'exempt_exceeded' | 'no_note' | null
    let dayDeductionAmount = 0;
    let deductionType = 'none'; // 'none' | 'lateness' | 'absence' | 'waived' | 'custom'

    if (isWeeklyOff) {
      dayStatus = 'Weekly Off';
      totalWeeklyOffs += 1;
    } else if (holiday) {
      dayStatus = `Holiday: ${holiday.name || holiday.title || 'Gym Holiday'}`;
      totalHolidays += 1;
    } else if (isLeave) {
      dayStatus = 'Approved Leave';
      totalApprovedLeaves += 1;
    } else if (!record && !isFuture) {
      // Past day with no attendance punch -> Absent
      dayStatus = 'Absent';
      totalAbsentDays += 1;
      dayDeductionAmount = dailyWage;
      deductionType = 'absence';
      totalAbsenceDeductionAmount += dayDeductionAmount;
    } else if (isFuture) {
      dayStatus = 'Upcoming';
    } else {
      // Day has attendance record or punches
      totalPresentDays += 1;
      const punches = Array.isArray(record?.punches) ? record.punches : [];
      const loginPunches = punches
        .filter((p) => String(p.type || '').toLowerCase() === 'login' && p.at)
        .sort((a, b) => new Date(a.at) - new Date(b.at));

      // Resolve shift 1 punch
      const firstPunchAt = record?.firstLoginAt || record?.checkIn || loginPunches[0]?.at || record?.updatedAt;
      shift1PunchMinutes = isoToMinutes(firstPunchAt);

      if (s1Start != null && shift1PunchMinutes != null) {
        shift1Late = calculateLateDeductionMinutes(shift1PunchMinutes, s1Start, graceMinutes, stepMinutes);
      }

      // Resolve shift 2 punch if split shift
      if (hasShift2 && s2Start != null) {
        // Look for punch around evening window (e.g. after shift 1 end or after 12:00 PM)
        const cutoffForShift2 = s1End != null ? s1End + 60 : 720;
        const eveningPunch = loginPunches.find((p) => {
          const m = isoToMinutes(p.at);
          return m != null && m >= cutoffForShift2;
        });
        if (eveningPunch) {
          shift2PunchMinutes = isoToMinutes(eveningPunch.at);
          shift2Late = calculateLateDeductionMinutes(shift2PunchMinutes, s2Start, graceMinutes, stepMinutes);
        }
      }

      const isLateToday = shift1Late.isLate || shift2Late.isLate;
      dayLateMinutes = shift1Late.deductedMinutes + shift2Late.deductedMinutes;

      if (isLateToday) {
        totalLateDays += 1;

        if (note) {
          if (runningNoteExemptionCount < maxExemptions) {
            runningNoteExemptionCount += 1;
            noteExemptionStatus = `exempt_${runningNoteExemptionCount}_of_${maxExemptions}`;
            dayDeductionAmount = 0;
            deductionType = 'none';
          } else {
            noteExemptionStatus = 'exempt_limit_exceeded';
            dayDeductionAmount = dayLateMinutes * perMinuteRate;
            deductionType = 'lateness';
            totalDeductedLateMinutes += dayLateMinutes;
            totalLatenessDeductionAmount += dayDeductionAmount;
          }
        } else {
          noteExemptionStatus = 'no_note';
          dayDeductionAmount = dayLateMinutes * perMinuteRate;
          deductionType = 'lateness';
          totalDeductedLateMinutes += dayLateMinutes;
          totalLatenessDeductionAmount += dayDeductionAmount;
        }
      }
    }

    // Apply Owner Manual Override if present
    if (override) {
      if (override.status === 'waived') {
        if (deductionType === 'lateness') {
          totalLatenessDeductionAmount -= dayDeductionAmount;
          totalDeductedLateMinutes -= dayLateMinutes;
        } else if (deductionType === 'absence') {
          totalAbsenceDeductionAmount -= dayDeductionAmount;
        }
        dayDeductionAmount = 0;
        deductionType = 'waived';
        totalManualWaiverCount += 1;
      } else if (override.status === 'custom_deduction' && Number.isFinite(override.customDeductionAmount)) {
        if (deductionType === 'lateness') {
          totalLatenessDeductionAmount -= dayDeductionAmount;
        } else if (deductionType === 'absence') {
          totalAbsenceDeductionAmount -= dayDeductionAmount;
        }
        dayDeductionAmount = Number(override.customDeductionAmount);
        deductionType = 'custom';
        totalLatenessDeductionAmount += dayDeductionAmount;
      }
    }

    dayBreakdown.push({
      date: dateStr,
      dayOfWeek,
      status: dayStatus,
      isFuture,
      isWeeklyOff,
      isHoliday: Boolean(holiday),
      holidayTitle: holiday?.name || holiday?.title || null,
      isApprovedLeave: isLeave,
      shift1ExpectedStart: minutesToDisplayTime(s1Start),
      shift1PunchTime: minutesToDisplayTime(shift1PunchMinutes),
      shift1LateMinutes: shift1Late.rawLateMinutes,
      shift1DeductedMinutes: shift1Late.deductedMinutes,
      shift2ExpectedStart: hasShift2 ? minutesToDisplayTime(s2Start) : null,
      shift2PunchTime: hasShift2 ? minutesToDisplayTime(shift2PunchMinutes) : null,
      shift2LateMinutes: shift2Late.rawLateMinutes,
      shift2DeductedMinutes: shift2Late.deductedMinutes,
      totalLateMinutes: dayLateMinutes,
      hasNote: Boolean(note),
      noteCategory: note?.noteCategory || note?.note_category || null,
      noteText: note?.note || null,
      noteExemptionStatus,
      dayDeductionAmount: Math.round(dayDeductionAmount * 100) / 100,
      deductionType,
      overrideStatus: override?.status || null,
      overrideReason: override?.reason || null,
    });
  }

  const totalDeductions = Math.round((totalLatenessDeductionAmount + totalAbsenceDeductionAmount) * 100) / 100;
  const netPayableSalary = Math.max(0, Math.round((monthlySalary - totalDeductions) * 100) / 100);

  return {
    staffId,
    staffName,
    year,
    month,
    monthlySalary,
    dailyWage: Math.round(dailyWage * 100) / 100,
    perMinuteRate: Math.round(perMinuteRate * 1000) / 1000,
    shiftMode: profile?.shiftMode || DEFAULT_SHIFT_MODE,
    shift1Start: profile?.shift1Start || '06:30',
    shift1End: profile?.shift1End || '11:00',
    shift2Start: profile?.shift2Start || (hasShift2 ? '17:00' : null),
    shift2End: profile?.shift2End || (hasShift2 ? '20:00' : null),
    graceMinutes,
    stepMinutes,
    monthlyNoteExemptions: maxExemptions,
    noteExemptionsUsed: runningNoteExemptionCount,
    totalDaysInMonth,
    totalPresentDays,
    totalAbsentDays,
    totalWeeklyOffs,
    totalHolidays,
    totalApprovedLeaves,
    totalLateDays,
    totalDeductedLateMinutes,
    totalLatenessDeductionAmount: Math.round(totalLatenessDeductionAmount * 100) / 100,
    totalAbsenceDeductionAmount: Math.round(totalAbsenceDeductionAmount * 100) / 100,
    totalManualWaivers: totalManualWaiverCount,
    totalDeductions,
    netPayableSalary,
    dayBreakdown,
  };
}

/**
 * Storage helpers for Salary Configurations, Holidays, and Manual Overrides
 */
async function mutateSupabaseSalaryConfig(updater) {
  const sb = getSupabase();
  const gid = gymId();
  const { data: existingRow, error: selErr } = await sb
    .from(T.settings_app_config)
    .select('*')
    .eq('gym_id', gid)
    .maybeSingle();
  if (selErr) throw selErr;

  const currentCfg =
    existingRow?.config_json && typeof existingRow.config_json === 'object'
      ? { ...existingRow.config_json }
      : {};

  const nextCfg = updater(currentCfg);

  if (existingRow) {
    const { error: updateErr } = await sb
      .from(T.settings_app_config)
      .update({
        config_json: nextCfg,
        updated_at: new Date().toISOString(),
      })
      .eq('gym_id', gid);
    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await sb
      .from(T.settings_app_config)
      .insert({
        gym_id: gid,
        config_json: nextCfg,
        updated_at: new Date().toISOString(),
      });
    if (insertErr) throw insertErr;
  }
  return nextCfg;
}

export async function getStaffSalarySettings() {
  if (useSupabase()) {
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(T.settings_app_config)
        .select('config_json')
        .eq('gym_id', gid)
        .maybeSingle();
      if (error) throw error;
      const cfg = data?.config_json && typeof data.config_json === 'object' ? data.config_json : {};
      return {
        profiles:
          cfg.staffSalaryProfiles && typeof cfg.staffSalaryProfiles === 'object'
            ? cfg.staffSalaryProfiles
            : {},
        holidays: Array.isArray(cfg.gymHolidays) ? cfg.gymHolidays : [],
        overrides: Array.isArray(cfg.salaryManualOverrides) ? cfg.salaryManualOverrides : [],
      };
    } catch (e) {
      console.error('[salaryCalculator] Supabase getStaffSalarySettings failed', e?.message || e);
    }
  }

  const [profiles, holidays, overrides] = await Promise.all([
    readJsonValue(STORE_KEY_SALARY_CONFIG, {}, null),
    readJsonValue(STORE_KEY_HOLIDAYS, [], null),
    readJsonValue(STORE_KEY_OVERRIDES, [], null),
  ]);

  return {
    profiles: profiles && typeof profiles === 'object' ? profiles : {},
    holidays: Array.isArray(holidays) ? holidays : [],
    overrides: Array.isArray(overrides) ? overrides : [],
  };
}

export async function saveStaffSalaryProfile(staffLoginId, profileData) {
  const staffId = String(staffLoginId || '').trim();
  if (!staffId) throw new Error('staffLoginId is required');

  if (useSupabase()) {
    let savedProfile = null;
    await mutateSupabaseSalaryConfig((cfg) => {
      const existingProfiles =
        cfg.staffSalaryProfiles && typeof cfg.staffSalaryProfiles === 'object'
          ? { ...cfg.staffSalaryProfiles }
          : {};
      const matchedKey =
        Object.keys(existingProfiles).find((k) => k.toLowerCase() === staffId.toLowerCase()) || staffId;
      const updated = {
        ...(existingProfiles[matchedKey] || {}),
        ...profileData,
        monthlySalary: Number(profileData.monthlySalary || 0),
        staffLoginId: staffId,
        updatedAt: new Date().toISOString(),
      };
      existingProfiles[matchedKey] = updated;
      existingProfiles[staffId] = updated;
      cfg.staffSalaryProfiles = existingProfiles;
      savedProfile = updated;
      return cfg;
    });
    return savedProfile;
  }

  const existing = (await readJsonValue(STORE_KEY_SALARY_CONFIG, {}, null)) || {};
  const matchedKey =
    Object.keys(existing).find((k) => k.toLowerCase() === staffId.toLowerCase()) || staffId;
  const updated = {
    ...existing,
    [matchedKey]: {
      ...(existing[matchedKey] || {}),
      ...profileData,
      monthlySalary: Number(profileData.monthlySalary || 0),
      staffLoginId: staffId,
      updatedAt: new Date().toISOString(),
    },
    [staffId]: {
      ...(existing[matchedKey] || {}),
      ...profileData,
      monthlySalary: Number(profileData.monthlySalary || 0),
      staffLoginId: staffId,
      updatedAt: new Date().toISOString(),
    },
  };
  await writeJsonValue(STORE_KEY_SALARY_CONFIG, updated, null);
  return updated[staffId];
}

export async function saveGymHoliday(holidayData) {
  const id = holidayData.id || `hol_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const dateStr = String(holidayData.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Valid date required (YYYY-MM-DD)');

  const entry = {
    id,
    date: dateStr,
    name: String(holidayData.name || holidayData.title || 'Gym Holiday').trim(),
    isPaid: holidayData.isPaid !== false,
    gymCodeId: holidayData.gymCodeId || null,
    createdAt: holidayData.createdAt || new Date().toISOString(),
  };

  if (useSupabase()) {
    await mutateSupabaseSalaryConfig((cfg) => {
      const list = Array.isArray(cfg.gymHolidays) ? [...cfg.gymHolidays] : [];
      const existingIndex = list.findIndex((h) => h.id === id || h.date === dateStr);
      if (existingIndex >= 0) {
        list[existingIndex] = entry;
      } else {
        list.push(entry);
      }
      list.sort((a, b) => a.date.localeCompare(b.date));
      cfg.gymHolidays = list;
      return cfg;
    });
    return entry;
  }

  const holidays = (await readJsonValue(STORE_KEY_HOLIDAYS, [], null)) || [];
  const list = Array.isArray(holidays) ? [...holidays] : [];
  const existingIndex = list.findIndex((h) => h.id === id || h.date === dateStr);
  if (existingIndex >= 0) {
    list[existingIndex] = entry;
  } else {
    list.push(entry);
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  await writeJsonValue(STORE_KEY_HOLIDAYS, list, null);
  return entry;
}

export async function deleteGymHoliday(holidayId) {
  if (useSupabase()) {
    await mutateSupabaseSalaryConfig((cfg) => {
      const list = Array.isArray(cfg.gymHolidays) ? [...cfg.gymHolidays] : [];
      const filtered = list.filter((h) => h.id !== holidayId && h.date !== holidayId);
      cfg.gymHolidays = filtered;
      return cfg;
    });
    return { ok: true, deleted: holidayId };
  }

  const holidays = (await readJsonValue(STORE_KEY_HOLIDAYS, [], null)) || [];
  const list = Array.isArray(holidays) ? [...holidays] : [];
  const filtered = list.filter((h) => h.id !== holidayId && h.date !== holidayId);
  await writeJsonValue(STORE_KEY_HOLIDAYS, filtered, null);
  return { ok: true, deleted: holidayId };
}

export async function saveSalaryManualOverride(overrideData, actor = 'owner') {
  const staffId = String(overrideData.staffLoginId || '').trim();
  const dateStr = String(overrideData.date || '').slice(0, 10);
  if (!staffId || !dateStr) throw new Error('staffLoginId and date required');

  const entry = {
    id: overrideData.id || `ovr_${staffId}_${dateStr}`,
    staffLoginId: staffId,
    date: dateStr,
    status: overrideData.status === 'custom_deduction' ? 'custom_deduction' : 'waived',
    customDeductionAmount: Number(overrideData.customDeductionAmount || 0),
    reason: String(overrideData.reason || '').trim(),
    updatedBy: actor,
    updatedAt: new Date().toISOString(),
  };

  if (useSupabase()) {
    await mutateSupabaseSalaryConfig((cfg) => {
      const list = Array.isArray(cfg.salaryManualOverrides) ? [...cfg.salaryManualOverrides] : [];
      const existingIndex = list.findIndex(
        (o) => o.staffLoginId.toLowerCase() === staffId.toLowerCase() && o.date === dateStr,
      );
      if (existingIndex >= 0) {
        list[existingIndex] = entry;
      } else {
        list.push(entry);
      }
      cfg.salaryManualOverrides = list;
      return cfg;
    });
    return entry;
  }

  const overrides = (await readJsonValue(STORE_KEY_OVERRIDES, [], null)) || [];
  const list = Array.isArray(overrides) ? [...overrides] : [];

  const existingIndex = list.findIndex(
    (o) => o.staffLoginId.toLowerCase() === staffId.toLowerCase() && o.date === dateStr,
  );
  if (existingIndex >= 0) {
    list[existingIndex] = entry;
  } else {
    list.push(entry);
  }

  await writeJsonValue(STORE_KEY_OVERRIDES, list, null);
  return entry;
}

export async function deleteSalaryManualOverride(staffLoginId, dateStr) {
  const staffId = String(staffLoginId || '').trim();
  const d = String(dateStr || '').slice(0, 10);

  if (useSupabase()) {
    await mutateSupabaseSalaryConfig((cfg) => {
      const list = Array.isArray(cfg.salaryManualOverrides) ? [...cfg.salaryManualOverrides] : [];
      const filtered = list.filter(
        (o) => !(o.staffLoginId.toLowerCase() === staffId.toLowerCase() && o.date === d),
      );
      cfg.salaryManualOverrides = filtered;
      return cfg;
    });
    return { ok: true };
  }

  const overrides = (await readJsonValue(STORE_KEY_OVERRIDES, [], null)) || [];
  const list = Array.isArray(overrides) ? [...overrides] : [];
  const filtered = list.filter(
    (o) => !(o.staffLoginId.toLowerCase() === staffId.toLowerCase() && o.date === d),
  );
  await writeJsonValue(STORE_KEY_OVERRIDES, filtered, null);
  return { ok: true };
}
