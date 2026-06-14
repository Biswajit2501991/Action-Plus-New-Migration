import { describe, it, expect, vi } from 'vitest';
import {
  fetchAuditLogsFromBackend,
  parseAuditLogsRequestedLimit,
  AUDIT_LOGS_PAGE_SIZE,
  DEFAULT_AUDIT_LOGS_QUERY,
} from '../src/features/audit/auditLogsFetch.js';

describe('parseAuditLogsRequestedLimit', () => {
  it('reads limit from query string', () => {
    expect(parseAuditLogsRequestedLimit('view=list&days=90&limit=3000')).toBe(3000);
  });

  it('falls back to default when limit missing', () => {
    expect(parseAuditLogsRequestedLimit('view=list&days=90')).toBe(25000);
  });

  it('caps at 50000', () => {
    expect(parseAuditLogsRequestedLimit('limit=999999')).toBe(50000);
  });
});

describe('fetchAuditLogsFromBackend', () => {
  it('pages in 1000-row batches until a short page', async () => {
    const calls = [];
    const backendJson = vi.fn(async (path) => {
      calls.push(path);
      const offset = Number(/offset=(\d+)/.exec(path)?.[1] || 0);
      if (offset === 0) {
        return Array.from({ length: AUDIT_LOGS_PAGE_SIZE }, (_, i) => ({ id: `a-${i}`, ts: '2026-06-13T00:00:00.000Z' }));
      }
      if (offset === 1000) {
        return Array.from({ length: 500 }, (_, i) => ({ id: `b-${i}`, ts: '2026-06-12T00:00:00.000Z' }));
      }
      return [];
    });
    const rows = await fetchAuditLogsFromBackend(backendJson, 'view=list&days=2555&limit=25000');
    expect(rows).toHaveLength(1500);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/offset=0/);
    expect(calls[1]).toMatch(/offset=1000/);
  });

  it('stops at requested limit', async () => {
    const backendJson = vi.fn(async () =>
      Array.from({ length: AUDIT_LOGS_PAGE_SIZE }, (_, i) => ({ id: String(i), ts: '2026-06-13T00:00:00.000Z' })),
    );
    const rows = await fetchAuditLogsFromBackend(backendJson, 'view=list&limit=1500');
    expect(rows).toHaveLength(1500);
    expect(backendJson).toHaveBeenCalledTimes(2);
  });

  it('uses default query when baseQuery omitted', async () => {
    const backendJson = vi.fn(async () => []);
    await fetchAuditLogsFromBackend(backendJson);
    expect(backendJson.mock.calls[0][0]).toContain(DEFAULT_AUDIT_LOGS_QUERY.split('&')[0]);
  });
});
