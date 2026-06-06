import { describe, it, expect } from 'vitest';
import { mergeAuditLogs } from '../src/features/audit/auditLogMerge.js';

describe('mergeAuditLogs', () => {
  it('merges by id with incoming winning and sorts newest first', () => {
    const prev = [
      { id: 'a', ts: '2026-01-01T00:00:00.000Z', action: 'old' },
      { id: 'b', ts: '2026-01-02T00:00:00.000Z', action: 'keep' },
    ];
    const incoming = [
      { id: 'a', ts: '2026-01-03T00:00:00.000Z', action: 'new' },
      { id: 'c', ts: '2026-01-04T00:00:00.000Z', action: 'added' },
    ];
    const merged = mergeAuditLogs(prev, incoming);
    expect(merged.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(merged.find((l) => l.id === 'a')?.action).toBe('new');
  });

  it('respects limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      ts: new Date(2026, 0, i + 1).toISOString(),
    }));
    expect(mergeAuditLogs([], rows, 3)).toHaveLength(3);
  });
});
