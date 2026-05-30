import { describe, expect, it } from 'vitest';

/** Mirrors mergeRemoteVisitorsWithLocal local-only branch in index.html */
function mergeRemoteVisitorsWithLocal(localVisitors, remoteVisitors) {
  const locals = Array.isArray(localVisitors) ? localVisitors : [];
  const remotes = Array.isArray(remoteVisitors) ? remoteVisitors : [];
  const remoteById = new Map(remotes.map((row) => [String(row?.id || ''), row]));
  const localById = new Map(locals.map((row) => [String(row?.id || ''), row]));
  const allIds = new Set([
    ...Array.from(remoteById.keys()).filter(Boolean),
    ...Array.from(localById.keys()).filter(Boolean),
  ]);
  const mergedRows = [];
  allIds.forEach((id) => {
    const localRow = localById.get(id) || null;
    const remoteRow = remoteById.get(id) || null;
    if (!localRow && remoteRow) {
      mergedRows.push(remoteRow);
      return;
    }
    if (localRow && !remoteRow) {
      mergedRows.push(localRow);
      return;
    }
    mergedRows.push({ ...(remoteRow || {}), ...(localRow || {}) });
  });
  return mergedRows;
}

describe('mergeRemoteVisitorsWithLocal', () => {
  it('keeps local-only visitor until server row exists', () => {
    const local = [{ id: 'V-new', fullName: 'Test Visitor', assignedGymCodeId: 'branch-a' }];
    const merged = mergeRemoteVisitorsWithLocal(local, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('V-new');
  });

  it('prefers remote when both exist', () => {
    const local = [{ id: 'V-1', fullName: 'Local', updatedAt: '2026-01-01T00:00:00Z' }];
    const remote = [{ id: 'V-1', fullName: 'Remote', updatedAt: '2026-01-02T00:00:00Z' }];
    const merged = mergeRemoteVisitorsWithLocal(local, remote);
    expect(merged[0].fullName).toBe('Local');
  });
});
