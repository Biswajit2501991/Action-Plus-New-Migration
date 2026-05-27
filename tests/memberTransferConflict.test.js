import { describe, expect, it } from 'vitest';

function resolveTransferMemberId({ memberId, formNo, fromBranch, toBranch, members }) {
  const source = String(fromBranch || '').trim();
  const target = String(toBranch || '').trim();
  if (!source || !target || source === target) return String(memberId || '').trim();
  const n = Number(formNo || 0);
  if (!Number.isFinite(n) || n <= 0) return String(memberId || '').trim();
  const hasConflict = (Array.isArray(members) ? members : []).some((m) =>
    String(m?.assignedGymCodeId || '').trim() === target && Number(m?.formNo || 0) === n);
  if (!hasConflict) return String(memberId || '').trim();
  const base = String(memberId || '').trim();
  let candidate = `${base}-MOVED`;
  let i = 2;
  while ((Array.isArray(members) ? members : []).some((m) => String(m?.memberId || '').trim() === candidate)) {
    candidate = `${base}-MOVED${i}`;
    i += 1;
  }
  return candidate;
}

describe('member transfer conflict resolution', () => {
  it('suffixes memberId with -MOVED when target branch has same formNo', () => {
    const rows = [
      { memberId: 'APG-1005/26-A', formNo: 1005, assignedGymCodeId: 'A' },
      { memberId: 'APG-1005/26-B', formNo: 1005, assignedGymCodeId: 'B' }, // conflict in target
    ];
    const next = resolveTransferMemberId({
      memberId: 'APG-1005/26-A',
      formNo: 1005,
      fromBranch: 'A',
      toBranch: 'B',
      members: rows,
    });
    expect(next).toMatch(/-MOVED/);
  });
});

