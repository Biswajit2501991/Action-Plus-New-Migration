import { describe, it, expect } from 'vitest';

/**
 * Mirrors frontend resolveDayPunches / backend attachPunches merge+collapse.
 * Daily summary stays one row; expand lists every meaningful punch.
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

  const near = (a, b, windowMs = 60000) => {
    const am = Date.parse(a);
    const bm = Date.parse(b);
    return Number.isFinite(am) && Number.isFinite(bm) && Math.abs(am - bm) <= windowMs;
  };

  if (row.firstLoginAt && !cleaned.some((p) => p.type === 'login' && near(p.at, row.firstLoginAt))) {
    cleaned.push({ id: 'summary-login', type: 'login', at: row.firstLoginAt });
  }
  if (row.lastLogoutAt && !cleaned.some((p) => p.type === 'logout' && near(p.at, row.lastLogoutAt))) {
    cleaned.push({ id: 'summary-logout', type: 'logout', at: row.lastLogoutAt });
  }

  const sorted = cleaned.sort((a, b) => a.at.localeCompare(b.at));
  const out = [];
  for (const punch of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.type === punch.type) {
      if (punch.type === 'logout') out[out.length - 1] = punch;
      continue;
    }
    out.push(punch);
  }
  return out;
}

describe('attendance day punches', () => {
  it('includes first login even when a later re-login exists', () => {
    const punches = resolveDayPunches({
      firstLoginAt: '2026-07-27T10:24:10.000Z',
      lastLogoutAt: '2026-07-27T11:08:14.000Z',
      punches: [
        { id: 'a', type: 'logout', at: '2026-07-27T11:06:00.000Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T11:06:37.000Z' },
        { id: 'c', type: 'login', at: '2026-07-27T11:08:06.000Z' },
        { id: 'd', type: 'logout', at: '2026-07-27T11:08:14.000Z' },
      ],
    });
    expect(punches.map((p) => p.type)).toEqual(['login', 'logout', 'login', 'logout']);
    expect(punches[0].at).toBe('2026-07-27T10:24:10.000Z');
    expect(punches[1].at).toBe('2026-07-27T11:06:37.000Z');
    expect(punches[2].at).toBe('2026-07-27T11:08:06.000Z');
    expect(punches[3].at).toBe('2026-07-27T11:08:14.000Z');
  });

  it('collapses consecutive duplicate logouts', () => {
    const punches = resolveDayPunches({
      punches: [
        { id: 'a', type: 'logout', at: '2026-07-27T11:06:00.696Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T11:06:37.024Z' },
      ],
    });
    expect(punches).toHaveLength(1);
    expect(punches[0].type).toBe('logout');
    expect(punches[0].at).toBe('2026-07-27T11:06:37.024Z');
  });

  it('keeps alternating login/logout sessions intact', () => {
    const punches = resolveDayPunches({
      firstLoginAt: '2026-07-27T03:00:00.000Z',
      lastLogoutAt: '2026-07-27T12:00:00.000Z',
      punches: [
        { id: 'a', type: 'login', at: '2026-07-27T03:00:00.000Z' },
        { id: 'b', type: 'logout', at: '2026-07-27T06:00:00.000Z' },
        { id: 'c', type: 'login', at: '2026-07-27T08:00:00.000Z' },
        { id: 'd', type: 'logout', at: '2026-07-27T12:00:00.000Z' },
      ],
    });
    expect(punches.map((p) => p.type)).toEqual(['login', 'logout', 'login', 'logout']);
  });
});
