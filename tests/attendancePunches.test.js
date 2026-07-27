import { describe, it, expect } from 'vitest';

/**
 * Mirrors frontend resolveDayPunches / backend attachPunches fallback for unit coverage.
 * Daily summary stays one row; expand lists every punch.
 */
function resolveDayPunches(row) {
  const listed = Array.isArray(row.punches) ? row.punches : [];
  const cleaned = listed
    .map((p) => ({
      id: String(p.id || `${p.type}-${p.at}`),
      type: String(p.type || '').toLowerCase() === 'logout' ? 'logout' : 'login',
      at: String(p.at || '').trim(),
    }))
    .filter((p) => p.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (cleaned.length) return cleaned;

  const synthetic = [];
  if (row.firstLoginAt) {
    synthetic.push({ id: 'legacy-login', type: 'login', at: row.firstLoginAt });
  }
  if (row.lastLogoutAt) {
    synthetic.push({ id: 'legacy-logout', type: 'logout', at: row.lastLogoutAt });
  }
  return synthetic;
}

function applyPunchToSummary(existing, punchType, at) {
  const punch = { id: `p-${at}`, type: punchType, at };
  if (!existing) {
    return {
      date: at.slice(0, 10),
      userId: 'staff1',
      status: 'Present',
      firstLoginAt: punchType === 'login' ? at : '',
      lastLogoutAt: punchType === 'logout' ? at : '',
      punches: [punch],
    };
  }
  return {
    ...existing,
    firstLoginAt: existing.firstLoginAt || (punchType === 'login' ? at : existing.firstLoginAt),
    lastLogoutAt: punchType === 'logout' ? at : existing.lastLogoutAt,
    punches: [...(existing.punches || []), punch],
  };
}

describe('attendance day punches', () => {
  it('keeps one daily summary while recording every login/logout', () => {
    let row = applyPunchToSummary(null, 'login', '2026-07-27T03:00:00.000Z');
    row = applyPunchToSummary(row, 'logout', '2026-07-27T07:00:00.000Z');
    row = applyPunchToSummary(row, 'login', '2026-07-27T08:30:00.000Z');
    row = applyPunchToSummary(row, 'logout', '2026-07-27T12:00:00.000Z');

    expect(row.firstLoginAt).toBe('2026-07-27T03:00:00.000Z');
    expect(row.lastLogoutAt).toBe('2026-07-27T12:00:00.000Z');
    expect(row.punches).toHaveLength(4);
    expect(row.punches.map((p) => p.type)).toEqual(['login', 'logout', 'login', 'logout']);
  });

  it('falls back to summary stamps when punch list is empty', () => {
    const punches = resolveDayPunches({
      firstLoginAt: '2026-07-27T03:00:00.000Z',
      lastLogoutAt: '2026-07-27T12:00:00.000Z',
      punches: [],
    });
    expect(punches).toEqual([
      { id: 'legacy-login', type: 'login', at: '2026-07-27T03:00:00.000Z' },
      { id: 'legacy-logout', type: 'logout', at: '2026-07-27T12:00:00.000Z' },
    ]);
  });

  it('prefers stored punch events over legacy fallback', () => {
    const punches = resolveDayPunches({
      firstLoginAt: '2026-07-27T03:00:00.000Z',
      lastLogoutAt: '2026-07-27T12:00:00.000Z',
      punches: [
        { id: 'a', type: 'login', at: '2026-07-27T03:00:00.000Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T06:00:00.000Z' },
        { id: 'c', type: 'login', at: '2026-07-27T08:00:00.000Z' },
      ],
    });
    expect(punches).toHaveLength(3);
    expect(punches[2].type).toBe('login');
  });
});
