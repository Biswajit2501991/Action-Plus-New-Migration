import { describe, expect, it } from 'vitest';

/**
 * Mirrors SQL keeper preference in
 * backend/migrations/supabase_staff_attendance_records_dedupe_day.sql
 * and the limit(1)+order used by findStaffAttendanceDayRow (avoid maybeSingle / PGRST116).
 */
function pickStaffAttendanceDayKeeper(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [...rows].sort((a, b) => {
    const aHas = a.first_login_at ? 0 : 1;
    const bHas = b.first_login_at ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    const aLogin = String(a.first_login_at || '');
    const bLogin = String(b.first_login_at || '');
    if (aLogin && bLogin && aLogin !== bLogin) return aLogin.localeCompare(bLogin);
    const aUp = String(a.updated_at || '');
    const bUp = String(b.updated_at || '');
    if (aUp !== bUp) return bUp.localeCompare(aUp);
    return Number(a.id || 0) - Number(b.id || 0);
  })[0];
}

function pickNewestByUpdatedAt(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [...rows].sort((a, b) => {
    const aUp = String(a.updated_at || '');
    const bUp = String(b.updated_at || '');
    if (aUp !== bUp) return bUp.localeCompare(aUp);
    return Number(b.id || 0) - Number(a.id || 0);
  })[0];
}

describe('staff attendance day duplicate hardening', () => {
  it('prefers a row that has Time In when merging duplicates', () => {
    const keeper = pickStaffAttendanceDayKeeper([
      { id: 2, first_login_at: null, updated_at: '2026-09-04T12:00:00Z' },
      { id: 1, first_login_at: '2026-09-04T01:00:00Z', updated_at: '2026-09-04T01:00:00Z' },
    ]);
    expect(keeper.id).toBe(1);
  });

  it('keeps earliest Time In when both rows have login', () => {
    const keeper = pickStaffAttendanceDayKeeper([
      { id: 9, first_login_at: '2026-09-04T08:00:00Z', updated_at: '2026-09-04T18:00:00Z' },
      { id: 3, first_login_at: '2026-09-04T06:30:00Z', updated_at: '2026-09-04T06:30:00Z' },
    ]);
    expect(keeper.id).toBe(3);
  });

  it('punch path picks newest updated_at so maybeSingle is unnecessary', () => {
    const newest = pickNewestByUpdatedAt([
      { id: 1, updated_at: '2026-09-04T08:00:00Z' },
      { id: 7, updated_at: '2026-09-04T18:00:00Z' },
      { id: 2, updated_at: '2026-09-04T12:00:00Z' },
    ]);
    expect(newest.id).toBe(7);
  });

  it('returns null for empty duplicate sets', () => {
    expect(pickStaffAttendanceDayKeeper([])).toBe(null);
    expect(pickNewestByUpdatedAt(null)).toBe(null);
  });
});
