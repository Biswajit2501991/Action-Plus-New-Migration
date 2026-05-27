import { describe, it, expect } from 'vitest';
import {
  resolveDefaultAssignedGymCodeId,
  enforceStaffBranchOnForm,
  sanitizeAddMemberDraftForm,
} from '../src/features/branch/branchDefaultResolver.js';

const HQ = 'hq-id';
const R01 = 'rajabazar-id';
const gymCodes = [{ id: HQ, code: 'HQ' }, { id: R01, code: 'R01' }];

describe('resolveDefaultAssignedGymCodeId', () => {
  it('owner defaults to HQ', () => {
    expect(resolveDefaultAssignedGymCodeId({ id: 'owner', role: 'owner' }, { hqGymCodeId: HQ, gymCodes }))
      .toBe(HQ);
  });

  it('staff defaults to their branch, not HQ', () => {
    expect(resolveDefaultAssignedGymCodeId({ id: 'raja', role: 'staff', gymCodeId: R01 }, { hqGymCodeId: HQ, gymCodes }))
      .toBe(R01);
  });

  it('staff without branch stays blank (no HQ fallback)', () => {
    expect(resolveDefaultAssignedGymCodeId({ id: 'raja', role: 'staff' }, { hqGymCodeId: HQ, gymCodes }))
      .toBe('');
  });
});

describe('enforceStaffBranchOnForm', () => {
  it('staff HQ draft is corrected to staff branch', () => {
    expect(enforceStaffBranchOnForm(HQ, { id: 'raja', role: 'staff', gymCodeId: R01 }, { hqGymCodeId: HQ, gymCodes }))
      .toBe(R01);
  });

  it('owner keeps explicit selection', () => {
    expect(enforceStaffBranchOnForm(R01, { id: 'owner', role: 'owner' }, { hqGymCodeId: HQ, gymCodes }))
      .toBe(R01);
  });

  it('owner empty falls back to HQ', () => {
    expect(enforceStaffBranchOnForm('', { id: 'owner', role: 'owner' }, { hqGymCodeId: HQ, gymCodes }))
      .toBe(HQ);
  });
});

describe('sanitizeAddMemberDraftForm', () => {
  it('rewrites stale HQ on staff draft', () => {
    const out = sanitizeAddMemberDraftForm(
      { name: 'Test', assignedGymCodeId: HQ },
      { id: 'raja', role: 'staff', gymCodeId: R01 },
      { hqGymCodeId: HQ, gymCodes },
    );
    expect(out.assignedGymCodeId).toBe(R01);
    expect(out.name).toBe('Test');
  });
});
