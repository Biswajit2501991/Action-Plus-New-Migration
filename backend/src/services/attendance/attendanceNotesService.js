import { ATTENDANCE_NOTE_RETENTION_DAYS } from '../../../../src/features/attendance/attendanceNotesFeature.js';
import { validateAttendanceNotePayload } from '../../../../src/features/attendance/attendanceNotesValidation.js';
import {
  authHasGlobalBranchRead,
  resolveActiveBranchId,
  resolveReadBranchIds,
} from '../../auth/tenant/scopedAuth.js';
import { getStaffAppUser } from '../../auth/staffAuth.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { T } from '../../db/tables.js';
import {
  deleteExpiredAttendanceNotes,
  insertAttendanceNote,
  readAttendanceNotesInRange,
  readLatestAttendanceNote,
  resolveAttendanceRecordInternalId,
} from '../../db/supabase/attendanceNotesRepository.js';
import { punchStaffAttendance } from '../../db/supabase/repository.js';

async function readGymCodeRow(gymCodeId) {
  const sb = getSupabase();
  const gid = gymId();
  const id = String(gymCodeId || '').trim();
  if (!id) return null;
  const { data, error } = await sb
    .from(T.gym_codes)
    .select('id, code, name')
    .eq('gym_id', gid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Branch scope for attendance notes reads/writes.
 * @param {object} auth
 * @returns {string[]|null} null means master-owner global scope.
 */
export function resolveAttendanceNotesBranchIds(auth) {
  const readIds = resolveReadBranchIds(auth);
  // Master owner without an operational branch — same global read as attendance records.
  if (readIds === null) return null;
  return readIds;
}

function assertBranchAllowed(auth, gymCodeId) {
  const target = String(gymCodeId || '').trim();
  if (!target) {
    const err = new Error('gym-code-required');
    err.status = 400;
    throw err;
  }
  const allowed = resolveAttendanceNotesBranchIds(auth);
  if (allowed === null) return;
  if (!allowed.length || !allowed.includes(target)) {
    const err = new Error('cross-branch-note-forbidden');
    err.status = 403;
    throw err;
  }
}

async function resolveStaffBranchForNote(auth, staffLoginId) {
  const login = String(staffLoginId || '').trim();
  if (!login) {
    const err = new Error('staff-login-required');
    err.status = 400;
    throw err;
  }
  const user = await getStaffAppUser(login);
  if (!user) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  const gymCodeId = String(user.gymCodeId || resolveActiveBranchId(auth) || '').trim();
  assertBranchAllowed(auth, gymCodeId);
  const gymCode = await readGymCodeRow(gymCodeId);
  if (!gymCode) {
    const err = new Error('gym-code-not-found');
    err.status = 404;
    throw err;
  }
  return {
    staffLoginId: login,
    gymCodeId,
    branchCode: String(gymCode.code || '').trim(),
  };
}

async function ensureAttendanceRecordIdForNote(auth, {
  staffLoginId,
  attendanceDate,
  externalRecordId = null,
}) {
  let attendanceRecordId = await resolveAttendanceRecordInternalId({
    staffLoginId,
    attendanceDate,
    externalRecordId,
  });
  if (attendanceRecordId) return attendanceRecordId;

  const requester = String(auth?.userId || '').trim();
  const target = String(staffLoginId || '').trim();
  if (!requester || requester.toLowerCase() !== target.toLowerCase()) return null;

  const punched = await punchStaffAttendance(null, {
    userId: target,
    punchType: 'login',
    atIso: new Date().toISOString(),
    actorName: requester,
  });
  return resolveAttendanceRecordInternalId({
    staffLoginId: target,
    attendanceDate,
    externalRecordId: punched?.id || externalRecordId,
  });
}

/**
 * @param {object} auth
 * @param {object} body
 */
export async function createAttendanceNoteForAuth(auth, body) {
  assertAttendanceNotesFeatureEnabled(await readAttendanceNotesFeatureEnabled());
  const { noteCategory, note } = validateAttendanceNotePayload(body);
  const requester = String(auth?.userId || '').trim();
  const targetStaff = String(body?.staffLoginId || requester).trim();
  const isSelf = targetStaff.toLowerCase() === requester.toLowerCase();
  if (!isSelf && !authHasGlobalBranchRead(auth)) {
    const err = new Error('note-create-forbidden');
    err.status = 403;
    throw err;
  }

  const branch = await resolveStaffBranchForNote(auth, targetStaff);
  const attendanceDate = String(body?.attendanceDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    const err = new Error('invalid-attendance-date');
    err.status = 400;
    throw err;
  }

  const attendanceRecordId = await ensureAttendanceRecordIdForNote(auth, {
    staffLoginId: branch.staffLoginId,
    attendanceDate,
    externalRecordId: body?.attendanceRecordId || body?.attendanceExternalId || null,
  });
  if (!attendanceRecordId) {
    const err = new Error('attendance-record-not-found');
    err.status = 404;
    throw err;
  }

  return insertAttendanceNote({
    attendanceRecordId,
    staffLoginId: branch.staffLoginId,
    gymCodeId: branch.gymCodeId,
    branchCode: branch.branchCode,
    attendanceDate,
    noteCategory,
    note,
    createdBy: requester,
  });
}

export async function listAttendanceNotesForAuth(auth, query) {
  assertAttendanceNotesFeatureEnabled(await readAttendanceNotesFeatureEnabled());
  const startDate = String(query?.startDate || '').slice(0, 10);
  const endDate = String(query?.endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    const err = new Error('invalid_range');
    err.status = 400;
    throw err;
  }
  if (startDate > endDate) {
    const err = new Error('invalid_range');
    err.status = 400;
    throw err;
  }
  const branchIds = resolveAttendanceNotesBranchIds(auth);
  if (branchIds !== null && !branchIds.length) return [];
  const staffLoginId = String(query?.staffLoginId || '').trim() || null;
  if (staffLoginId && !authHasGlobalBranchRead(auth) && staffLoginId.toLowerCase() !== String(auth.userId || '').toLowerCase()) {
    const err = new Error('note-read-forbidden');
    err.status = 403;
    throw err;
  }
  return readAttendanceNotesInRange({
    startDate,
    endDate,
    staffLoginId,
    gymCodeIds: branchIds,
  });
}

export async function latestAttendanceNoteForAuth(auth, query) {
  assertAttendanceNotesFeatureEnabled(await readAttendanceNotesFeatureEnabled());
  const staffLoginId = String(query?.staffLoginId || auth?.userId || '').trim();
  const attendanceDate = String(query?.date || query?.attendanceDate || '').slice(0, 10);
  if (!staffLoginId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    const err = new Error('invalid_query');
    err.status = 400;
    throw err;
  }
  const branchIds = resolveAttendanceNotesBranchIds(auth);
  if (branchIds !== null && !branchIds.length) return null;
  return readLatestAttendanceNote({
    staffLoginId,
    attendanceDate,
    gymCodeIds: branchIds,
  });
}

export async function cleanupExpiredAttendanceNotesForGym() {
  return deleteExpiredAttendanceNotes();
}

export function attendanceNotesFeatureMeta() {
  return { retentionDays: ATTENDANCE_NOTE_RETENTION_DAYS };
}

export async function readAttendanceNotesFeatureEnabled() {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.settings_app_config)
    .select('config_json')
    .eq('gym_id', gid)
    .maybeSingle();
  if (error) throw error;
  const cfg = data?.config_json && typeof data.config_json === 'object' ? data.config_json : {};
  return cfg.attendanceNotesEnabled === true;
}

export function assertAttendanceNotesFeatureEnabled(enabled) {
  if (enabled === true) return;
  const err = new Error('attendance-notes-feature-disabled');
  err.status = 403;
  throw err;
}
