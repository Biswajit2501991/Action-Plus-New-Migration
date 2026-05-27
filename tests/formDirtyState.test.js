import { describe, expect, it } from 'vitest';
import {
  EDIT_MEMBER_DIRTY_KEYS,
  isMemberFormDirty,
  memberFieldValuesEqual,
  memberFormChangedMap,
  normalizeBranchId,
  memberEditBaselineKey,
} from '../src/features/members/formDirtyState.js';

describe('normalizeBranchId', () => {
  it('trims and stringifies', () => {
    expect(normalizeBranchId('  uuid-a  ')).toBe('uuid-a');
    expect(normalizeBranchId(null)).toBe('');
  });
});

describe('memberFieldValuesEqual assignedGymCodeId', () => {
  it('treats null and empty as equal', () => {
    expect(memberFieldValuesEqual(null, '', 'assignedGymCodeId')).toBe(true);
    expect(memberFieldValuesEqual(undefined, '', 'assignedGymCodeId')).toBe(true);
  });

  it('detects branch change', () => {
    expect(memberFieldValuesEqual('branch-a', 'branch-b', 'assignedGymCodeId')).toBe(false);
  });
});

describe('isMemberFormDirty', () => {
  const baseline = {
    memberId: 'APG-1',
    name: 'Test',
    assignedGymCodeId: 'branch-a',
    plan: 'Gold',
    status: 'Active',
    billingDate: '2025-01-01',
    amount: '1000',
    paymentMethod: 'Cash',
    mobile: '9876543210',
  };

  it('is false when draft matches baseline', () => {
    expect(isMemberFormDirty({ ...baseline }, baseline)).toBe(false);
  });

  it('is true when only gym branch changes', () => {
    const draft = { ...baseline, assignedGymCodeId: 'branch-b' };
    expect(isMemberFormDirty(draft, baseline)).toBe(true);
  });

  it('supports consecutive branch updates from new baseline', () => {
    const afterFirstSave = { ...baseline, assignedGymCodeId: 'branch-b' };
    expect(isMemberFormDirty(afterFirstSave, afterFirstSave)).toBe(false);
    const secondEdit = { ...afterFirstSave, assignedGymCodeId: 'branch-c' };
    expect(isMemberFormDirty(secondEdit, afterFirstSave)).toBe(true);
  });

  it('re-selecting same branch is not dirty', () => {
    const draft = { ...baseline, assignedGymCodeId: 'branch-a' };
    expect(isMemberFormDirty(draft, baseline)).toBe(false);
  });

  it('includes assignedGymCodeId in default keys', () => {
    expect(EDIT_MEMBER_DIRTY_KEYS).toContain('assignedGymCodeId');
  });
});

describe('memberFormChangedMap', () => {
  it('flags assignedGymCodeId only', () => {
    const baseline = { assignedGymCodeId: 'a', name: 'X' };
    const draft = { assignedGymCodeId: 'b', name: 'X' };
    const map = memberFormChangedMap(draft, baseline);
    expect(map.assignedGymCodeId).toBe(true);
    expect(map.name).toBe(false);
  });
});

describe('memberEditBaselineKey', () => {
  it('changes when branch or updatedAt changes', () => {
    const k1 = memberEditBaselineKey({ memberId: 'M1', assignedGymCodeId: 'a', updatedAt: 't1' });
    const k2 = memberEditBaselineKey({ memberId: 'M1', assignedGymCodeId: 'b', updatedAt: 't1' });
    const k3 = memberEditBaselineKey({ memberId: 'M1', assignedGymCodeId: 'b', updatedAt: 't2' });
    expect(k1).not.toBe(k2);
    expect(k2).not.toBe(k3);
  });
});
