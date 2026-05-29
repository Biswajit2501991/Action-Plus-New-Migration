import { describe, expect, it } from 'vitest';

function normalizeBranchIdList(row) {
  const fromAllowed = Array.isArray(row?.allowedBranchIds) ? row.allowedBranchIds : [];
  const fromAssigned = Array.isArray(row?.assignedBranchIds) ? row.assignedBranchIds : [];
  const ids = [...fromAllowed, ...fromAssigned].map((x) => String(x || '').trim()).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const single = String(row?.gymCodeId || row?.activeBranchId || '').trim();
  return single ? [single] : [];
}

function mergeAssignedBranchIds(localRow, remoteRow) {
  const localIds = normalizeBranchIdList(localRow);
  const remoteIds = normalizeBranchIdList(remoteRow);
  const union = [...new Set([...remoteIds, ...localIds])];
  if (union.length > 1) return union;
  if (remoteIds.length > 1) return remoteIds;
  if (localIds.length > 1) {
    if (remoteIds.length === 1 && localIds.includes(remoteIds[0])) return localIds;
    if (!remoteIds.length) return localIds;
  }
  return remoteIds.length ? remoteIds : localIds;
}

describe('mergeAssignedBranchIds', () => {
  it('keeps local multi-branch when remote only has primary', () => {
    const local = { gymCodeId: 'b1', assignedBranchIds: ['b1', 'b2', 'b3'] };
    const remote = { gymCodeId: 'b1', assignedBranchIds: ['b1'] };
    expect(mergeAssignedBranchIds(local, remote)).toEqual(['b1', 'b2', 'b3']);
  });

  it('prefers remote when remote has multiple branches', () => {
    const local = { gymCodeId: 'b1', assignedBranchIds: ['b1'] };
    const remote = { gymCodeId: 'b1', assignedBranchIds: ['b1', 'b2'] };
    expect(mergeAssignedBranchIds(local, remote)).toEqual(['b1', 'b2']);
  });

  it('unions local and remote branch ids', () => {
    const local = { gymCodeId: 'b1', assignedBranchIds: ['b1', 'b3'] };
    const remote = { gymCodeId: 'b1', assignedBranchIds: ['b1', 'b2'] };
    expect(mergeAssignedBranchIds(local, remote)).toEqual(['b1', 'b2', 'b3']);
  });

  it('uses allowedBranchIds when assignedBranchIds missing', () => {
    const local = { gymCodeId: 'b1', allowedBranchIds: ['b1', 'b2', 'b3'] };
    const remote = { gymCodeId: 'b1', assignedBranchIds: ['b1'] };
    expect(mergeAssignedBranchIds(local, remote)).toEqual(['b1', 'b2', 'b3']);
  });
});
