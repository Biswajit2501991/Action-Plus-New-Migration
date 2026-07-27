import { describe, it, expect } from 'vitest';

/**
 * Mirrors frontend resolveDayPunches / backend attachPunches merge+dedupe.
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
    .filter((p) => p.at);

  const hasLogin = cleaned.some((p) => p.type === 'login');
  const hasLogout = cleaned.some((p) => p.type === 'logout');
  if (!hasLogin && row.firstLoginAt) {
    cleaned.unshift({ id: 'summary-login', type: 'login', at: row.firstLoginAt });
  }
  if (!hasLogout && row.lastLogoutAt) {
    cleaned.push({ id: 'summary-logout', type: 'logout', at: row.lastLogoutAt });
  }

  const out = [];
  const seen = new Set();
  for (const punch of cleaned.sort((a, b) => a.at.localeCompare(b.at))) {
    const atMs = Date.parse(punch.at);
    const bucket = Number.isFinite(atMs) ? Math.floor(atMs / 15000) : punch.at;
    const key = `${punch.type}__${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(punch);
  }
  return out;
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

  it('merges first login stamp when punch list only has logouts', () => {
    const punches = resolveDayPunches({
      firstLoginAt: '2026-07-27T10:24:10.000Z',
      lastLogoutAt: '2026-07-27T11:06:00.000Z',
      punches: [
        { id: 'a', type: 'logout', at: '2026-07-27T11:06:00.000Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T11:06:05.000Z' },
      ],
    });
    expect(punches.map((p) => p.type)).toEqual(['login', 'logout']);
    expect(punches[0].at).toBe('2026-07-27T10:24:10.000Z');
  });

  it('dedupes accidental double logout within 15 seconds', () => {
    const punches = resolveDayPunches({
      punches: [
        { id: 'a', type: 'logout', at: '2026-07-27T11:06:00.696Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T11:06:10.024Z' },
      ],
    });
    expect(punches).toHaveLength(1);
    expect(punches[0].type).toBe('logout');
  });

  it('prefers stored punch events over empty fallback', () => {
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
