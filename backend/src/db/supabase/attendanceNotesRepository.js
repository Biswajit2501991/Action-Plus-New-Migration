import { T } from '../tables.js';
import { getSupabase, gymId } from './client.js';
import { fetchAll, isMissingDbTableError } from './utils.js';
import { ATTENDANCE_NOTE_RETENTION_DAYS } from '../../../../src/features/attendance/attendanceNotesFeature.js';

function noteRowToApp(row) {
  return {
    id: row.id,
    attendanceRecordId: row.attendance_record_id,
    staffLoginId: row.staff_login_id,
    gymCodeId: row.gym_code_id,
    branchCode: row.branch_code,
    attendanceDate: row.attendance_date,
    noteCategory: row.note_category,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

const ATTENDANCE_NOTES_MIGRATION_HINT =
  'Run backend/migrations/supabase_attendance_notes.sql and '
  + 'backend/migrations/supabase_attendance_notes_upsert.sql in Supabase SQL Editor '
  + '(includes NOTIFY pgrst reload).';

function rethrowAttendanceNotesDbError(error, action) {
  if (isMissingDbTableError(error)) {
    throw Object.assign(new Error('attendance-notes-table-missing'), {
      status: 503,
      detail: ATTENDANCE_NOTES_MIGRATION_HINT,
    });
  }
  throw new Error(`attendance_notes ${action}: ${error.message}`);
}

function retentionExpiresAt(fromIso = new Date().toISOString()) {
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + ATTENDANCE_NOTE_RETENTION_DAYS);
  return d.toISOString();
}

/**
 * Resolve internal staff_attendance_records.id for a staff member on a date.
 */
export async function resolveAttendanceRecordInternalId({
  staffLoginId,
  attendanceDate,
  externalRecordId = null,
}) {
  const sb = getSupabase();
  const gid = gymId();
  const uid = String(staffLoginId || '').trim();
  const date = String(attendanceDate || '').slice(0, 10);
  const extId = String(externalRecordId || '').trim();

  if (extId) {
    let q = sb.from(T.staff_attendance_records)
      .select('id')
      .eq('gym_id', gid)
      .eq('external_record_id', extId)
      .limit(1);
    const { data, error } = await q;
    if (error) rethrowAttendanceNotesDbError(error, 'resolve');
    const row = Array.isArray(data) ? data[0] : null;
    if (row?.id) return row.id;
  }

  if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const { data, error } = await sb
    .from(T.staff_attendance_records)
    .select('id')
    .eq('gym_id', gid)
    .eq('staff_login_id', uid)
    .eq('attendance_date', date)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) rethrowAttendanceNotesDbError(error, 'resolve');
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id || null;
}

/**
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function insertAttendanceNote(input) {
  const sb = getSupabase();
  const gid = gymId();
  const now = new Date().toISOString();
  const row = {
    gym_id: gid,
    attendance_record_id: input.attendanceRecordId,
    staff_login_id: String(input.staffLoginId || '').trim(),
    gym_code_id: input.gymCodeId,
    branch_code: String(input.branchCode || '').trim(),
    attendance_date: String(input.attendanceDate || '').slice(0, 10),
    note_category: input.noteCategory,
    note: input.note,
    created_by: String(input.createdBy || '').trim(),
    updated_at: now,
    expires_at: retentionExpiresAt(now),
  };
  const keyQuery = sb
    .from(T.attendance_notes)
    .select('id')
    .eq('gym_id', gid)
    .eq('staff_login_id', row.staff_login_id)
    .eq('attendance_date', row.attendance_date)
    .order('updated_at', { ascending: false });

  const { data: existingRows, error: existingError } = await keyQuery;
  if (existingError) rethrowAttendanceNotesDbError(existingError, 'upsert.lookup');

  if (Array.isArray(existingRows) && existingRows.length) {
    const { data, error } = await sb
      .from(T.attendance_notes)
      .update(row)
      .eq('gym_id', gid)
      .eq('staff_login_id', row.staff_login_id)
      .eq('attendance_date', row.attendance_date)
      .select('*');
    if (error) rethrowAttendanceNotesDbError(error, 'upsert.update');
    const latest = Array.isArray(data)
      ? [...data].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]
      : null;
    if (latest) return noteRowToApp(latest);
  }

  const { data, error } = await sb
    .from(T.attendance_notes)
    .insert({ ...row, created_at: now })
    .select('*')
    .single();
  if (error) rethrowAttendanceNotesDbError(error, 'upsert.insert');
  return noteRowToApp(data);
}

/**
 * @param {{ startDate: string, endDate: string, staffLoginId?: string|null, gymCodeIds?: string[]|null }} query
 */
export async function readAttendanceNotesInRange(query) {
  const sb = getSupabase();
  const gid = gymId();
  const startDate = String(query.startDate || '').slice(0, 10);
  const endDate = String(query.endDate || '').slice(0, 10);
  const staffLoginId = String(query.staffLoginId || '').trim();
  const gymCodeIds = Array.isArray(query.gymCodeIds)
    ? query.gymCodeIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;

  let q = sb
    .from(T.attendance_notes)
    .select('*')
    .eq('gym_id', gid)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false });

  if (staffLoginId) q = q.eq('staff_login_id', staffLoginId);
  if (gymCodeIds?.length) q = q.in('gym_code_id', gymCodeIds);

  const rows = await fetchAll((from, to) => q.range(from, to));
  return rows.map(noteRowToApp);
}

/**
 * Latest non-expired note for staff on a date (badge).
 */
export async function readLatestAttendanceNote({ staffLoginId, attendanceDate, gymCodeIds = null }) {
  const sb = getSupabase();
  const gid = gymId();
  const uid = String(staffLoginId || '').trim();
  const date = String(attendanceDate || '').slice(0, 10);
  if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  let q = sb
    .from(T.attendance_notes)
    .select('*')
    .eq('gym_id', gid)
    .eq('staff_login_id', uid)
    .eq('attendance_date', date)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(1);

  const gymCodeIdList = Array.isArray(gymCodeIds)
    ? gymCodeIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;
  if (gymCodeIdList?.length) q = q.in('gym_code_id', gymCodeIdList);

  const { data, error } = await q.maybeSingle();
  if (error) rethrowAttendanceNotesDbError(error, 'latest');
  return data ? noteRowToApp(data) : null;
}

/** Delete expired notes only — safe for pg_cron and manual ops. */
export async function deleteExpiredAttendanceNotes() {
  const sb = getSupabase();
  const gid = gymId();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(T.attendance_notes)
    .delete()
    .eq('gym_id', gid)
    .lt('expires_at', now)
    .select('id');
  if (error) rethrowAttendanceNotesDbError(error, 'cleanup');
  return { deleted: Array.isArray(data) ? data.length : 0 };
}
