import { Router } from 'express';
import crypto from 'node:crypto';
import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import {
  appendAuditLogEntry,
  listAttendanceNotes,
  readJsonCollection,
  readStaffAttendanceInRange,
} from '../db/dataStore.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { T } from '../db/tables.js';
import {
  calculateStaffMonthlySalary,
  deleteGymHoliday,
  deleteSalaryManualOverride,
  getDaysInMonthList,
  getStaffSalarySettings,
  saveGymHoliday,
  saveSalaryManualOverride,
  saveStaffSalaryProfile,
} from '../services/salary/salaryCalculatorService.js';

const router = Router();

function readSandboxScope(req) {
  const testProfile = String(req?.headers?.['x-apg-test-profile'] || '').trim() === '1';
  const sandboxId = String(req?.headers?.['x-apg-sandbox-id'] || '').trim();
  const userId = String(req?.headers?.['x-apg-user-id'] || '').trim();
  if (!testProfile || !sandboxId) return null;
  return { sandboxId, userId };
}

async function appendAuditLog(req, { action, entityType = '', entityId = '', before = null, after = null }) {
  try {
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req?.auth?.userId || 'system'),
      action,
      entityType,
      entityId: String(entityId || ''),
      before,
      after,
    };
    await appendAuditLogEntry(readSandboxScope(req), entry);
  } catch (err) {
    console.error('[apg] appendAuditLog failed in salaryCalculator', err?.message || err);
  }
}

/**
 * GET /api/salary-calculator/config
 * Read all salary profiles, holidays, and manual overrides.
 */
router.get('/config', requireAccess(Access.staffRead), async (req, res) => {
  try {
    const data = await getStaffSalarySettings();
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      error: 'salary_config_read_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * PUT /api/salary-calculator/profile/:staffId
 * Set / update salary amount and shift timings for a staff member.
 */
router.put('/profile/:staffId', requireAccess(Access.staffWrite), async (req, res) => {
  try {
    const staffId = decodeURIComponent(String(req.params.staffId || '').trim());
    if (!staffId) return res.status(400).json({ error: 'staff_id_required' });

    const saved = await saveStaffSalaryProfile(staffId, req.body || {});
    await appendAuditLog(req, {
      action: 'staff.salary_profile.updated',
      entityType: 'staff_salary_profile',
      entityId: staffId,
      after: saved,
    });

    return res.json({ ok: true, profile: saved });
  } catch (error) {
    return res.status(500).json({
      error: 'salary_profile_save_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * POST /api/salary-calculator/holiday
 * Add / update a gym holiday date.
 */
router.post('/holiday', requireAccess(Access.staffWrite), async (req, res) => {
  try {
    const saved = await saveGymHoliday(req.body || {});
    await appendAuditLog(req, {
      action: 'gym.holiday.saved',
      entityType: 'gym_holiday',
      entityId: saved.id || saved.date,
      after: saved,
    });
    return res.json({ ok: true, holiday: saved });
  } catch (error) {
    return res.status(500).json({
      error: 'gym_holiday_save_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * DELETE /api/salary-calculator/holiday/:holidayId
 * Delete a gym holiday.
 */
router.delete('/holiday/:holidayId', requireAccess(Access.staffWrite), async (req, res) => {
  try {
    const holidayId = decodeURIComponent(String(req.params.holidayId || '').trim());
    if (!holidayId) return res.status(400).json({ error: 'holiday_id_required' });

    await deleteGymHoliday(holidayId);
    await appendAuditLog(req, {
      action: 'gym.holiday.deleted',
      entityType: 'gym_holiday',
      entityId: holidayId,
    });
    return res.json({ ok: true, deleted: holidayId });
  } catch (error) {
    return res.status(500).json({
      error: 'gym_holiday_delete_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * POST /api/salary-calculator/override
 * Save an owner manual waiver or custom deduction for a staff on a date.
 */
router.post('/override', requireAccess(Access.staffWrite), async (req, res) => {
  try {
    const actor = req.auth?.userId || 'owner';
    const saved = await saveSalaryManualOverride(req.body || {}, actor);
    await appendAuditLog(req, {
      action: 'staff.salary_override.saved',
      entityType: 'salary_manual_override',
      entityId: `${saved.staffLoginId}_${saved.date}`,
      after: saved,
    });
    return res.json({ ok: true, override: saved });
  } catch (error) {
    return res.status(500).json({
      error: 'salary_override_save_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * DELETE /api/salary-calculator/override
 * Remove an owner manual override.
 */
router.delete('/override', requireAccess(Access.staffWrite), async (req, res) => {
  try {
    const staffId = String(req.query?.staffId || req.body?.staffId || '').trim();
    const dateStr = String(req.query?.date || req.body?.date || '').slice(0, 10);
    if (!staffId || !dateStr) {
      return res.status(400).json({ error: 'staffId and date query params required' });
    }
    await deleteSalaryManualOverride(staffId, dateStr);
    await appendAuditLog(req, {
      action: 'staff.salary_override.deleted',
      entityType: 'salary_manual_override',
      entityId: `${staffId}_${dateStr}`,
    });
    return res.json({ ok: true, deleted: { staffId, date: dateStr } });
  } catch (error) {
    return res.status(500).json({
      error: 'salary_override_delete_failed',
      message: String(error?.message || error),
    });
  }
});

/**
 * GET /api/salary-calculator/monthly-report
 * Compute full monthly salary breakdown and deductions for staff in a given month.
 */
router.get('/monthly-report', requireAccess(Access.staffRead), async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query?.year, 10) || now.getFullYear();
    const month = parseInt(req.query?.month, 10) || (now.getMonth() + 1);
    const filterStaffId = String(req.query?.staffId || '').trim();
    const filterBranchId = String(req.query?.gymCodeId || req.query?.branchId || '').trim();

    const days = getDaysInMonthList(year, month);
    const startDate = days[0];
    const endDate = days[days.length - 1];

    const scope = readSandboxScope(req);
    const [allUsers, attendanceRecords, notesData, settingsData] = await Promise.all([
      readJsonCollection('apg.users', [], scope).catch(() => []),
      readStaffAttendanceInRange(scope, { startDate, endDate }).catch(() => []),
      listAttendanceNotes(req.auth, { startDate, endDate }).catch(() => []),
      getStaffSalarySettings().catch(() => ({ profiles: {}, holidays: [], overrides: [] })),
    ]);

    const { profiles, holidays, overrides } = settingsData;

    // Load approved leaves in this date range if supabase is connected
    let leaveRequests = [];
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data: leaves } = await sb
        .from(T.leave_requests)
        .select('*')
        .eq('gym_id', gid)
        .eq('status', 'Approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate);
      if (Array.isArray(leaves)) {
        leaveRequests = leaves.map((l) => ({
          userId: l.staff_login_id,
          startDate: l.start_date,
          endDate: l.end_date,
          status: l.status,
        }));
      }
    } catch {
      leaveRequests = [];
    }

    // Filter staff list
    let targetUsers = (allUsers || []).filter((u) => !u.blocked);
    if (filterStaffId) {
      targetUsers = targetUsers.filter(
        (u) => String(u.id || '').toLowerCase() === filterStaffId.toLowerCase(),
      );
    }
    if (filterBranchId) {
      targetUsers = targetUsers.filter((u) => {
        const assigned = Array.isArray(u.assignedBranchIds) ? u.assignedBranchIds : [];
        return String(u.gymCodeId || '') === filterBranchId || assigned.includes(filterBranchId);
      });
    }

    const todayDateStr = now.toISOString().slice(0, 10);
    const staffReports = targetUsers.map((u) => {
      const staffId = String(u.id || '').trim();
      const matchedProfile =
        profiles[staffId] ||
        Object.entries(profiles).find(([k, v]) => {
          const kLow = String(k || '').trim().toLowerCase();
          const vLogin = String(v?.staffLoginId || '').trim().toLowerCase();
          const targetId = staffId.toLowerCase();
          const targetName = String(u.name || u.display_name || '').trim().toLowerCase();
          return (
            kLow === targetId ||
            vLogin === targetId ||
            (targetName && (kLow === targetName || vLogin === targetName))
          );
        })?.[1];

      const profile = matchedProfile || {
        staffLoginId: staffId,
        monthlySalary: 0,
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

      return calculateStaffMonthlySalary({
        staffUser: u,
        profile,
        year,
        month,
        attendanceRecords,
        attendanceNotes: notesData,
        gymHolidays: holidays,
        leaveRequests,
        manualOverrides: overrides,
        todayDateStr,
      });
    });

    // Compute monthly rollup stats
    const totalBasePayroll = staffReports.reduce((sum, r) => sum + r.monthlySalary, 0);
    const totalLatenessDeductions = staffReports.reduce((sum, r) => sum + r.totalLatenessDeductionAmount, 0);
    const totalAbsenceDeductions = staffReports.reduce((sum, r) => sum + r.totalAbsenceDeductionAmount, 0);
    const totalNetPayable = staffReports.reduce((sum, r) => sum + r.netPayableSalary, 0);
    const totalLateInstances = staffReports.reduce((sum, r) => sum + r.totalLateDays, 0);

    return res.json({
      ok: true,
      year,
      month,
      startDate,
      endDate,
      summary: {
        totalStaff: staffReports.length,
        totalBasePayroll: Math.round(totalBasePayroll * 100) / 100,
        totalLatenessDeductions: Math.round(totalLatenessDeductions * 100) / 100,
        totalAbsenceDeductions: Math.round(totalAbsenceDeductions * 100) / 100,
        totalNetPayable: Math.round(totalNetPayable * 100) / 100,
        totalLateInstances,
      },
      staffReports,
      holidays,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'salary_monthly_report_failed',
      message: String(error?.message || error),
    });
  }
});

export default router;
