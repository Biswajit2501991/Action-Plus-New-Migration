import { describe, expect, it } from 'vitest';
import {
  computeAddMemberProgress,
  countMedicalProgressAnswers,
} from '../frontend/src/features/members/add-member-progress.ts';

function flags(keys, invalidKeys = []) {
  const invalid = new Set(invalidKeys);
  return Object.fromEntries(keys.map((key) => [key, invalid.has(key)]));
}

const req1Keys = ['formNo', 'assignedGymCodeId', 'name', 'email', 'dob', 'gender', 'mobile', 'address'];
const req2Keys = ['staff', 'amount', 'plan', 'joiningDate', 'billingDate', 'paymentBy', 'status'];
const req5Keys = ['ackAccepted', 'ackSignature', 'parentGuardianName', 'parentGuardianSignature'];

function base(overrides = {}) {
  return {
    req1: flags(req1Keys, req1Keys),
    req2: flags(req2Keys, req2Keys),
    req3: { paymentMethod: true },
    req5: flags(req5Keys, req5Keys),
    medicalDone: false,
    medicalAnswered: 0,
    ...overrides,
  };
}

describe('add member progress', () => {
  it('starts at 0 when required fields are empty', () => {
    const progress = computeAddMemberProgress(base());
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
    expect(progress.sections.every((section) => !section.done)).toBe(true);
  });

  it('moves as required fields in a section become valid', () => {
    const empty = computeAddMemberProgress(base());
    const half = computeAddMemberProgress(base({
      req1: flags(req1Keys, req1Keys.slice(4)),
    }));
    expect(half.percent).toBeGreaterThan(empty.percent);
    expect(half.sections[0].done).toBe(false);
  });

  it('does not turn complete when only later steps are visited in the data', () => {
    const progress = computeAddMemberProgress(base({
      req5: flags(req5Keys),
    }));
    expect(progress.complete).toBe(false);
    expect(progress.percent).toBeLessThan(100);
    expect(progress.sections[4].done).toBe(true);
    expect(progress.sections[0].done).toBe(false);
  });

  it('turns complete only when every section rule is satisfied', () => {
    const progress = computeAddMemberProgress(base({
      req1: flags(req1Keys),
      req2: flags(req2Keys),
      req3: { paymentMethod: false },
      req5: flags(req5Keys),
      medicalDone: true,
    }));
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
    expect(progress.sections.every((section) => section.done)).toBe(true);
  });

  it('drops back below 100 when a finished required field is cleared', () => {
    const done = computeAddMemberProgress(base({
      req1: flags(req1Keys),
      req2: flags(req2Keys),
      req3: { paymentMethod: false },
      req5: flags(req5Keys),
      medicalDone: true,
    }));
    const cleared = computeAddMemberProgress(base({
      req1: flags(req1Keys, ['name']),
      req2: flags(req2Keys),
      req3: { paymentMethod: false },
      req5: flags(req5Keys),
      medicalDone: true,
    }));
    expect(done.complete).toBe(true);
    expect(cleared.complete).toBe(false);
    expect(cleared.percent).toBeLessThan(100);
    expect(cleared.sections[0].done).toBe(false);
  });

  it('treats a skipped or answered medical section as resolved', () => {
    const skipped = computeAddMemberProgress(base({ medicalDone: true }));
    const unanswered = computeAddMemberProgress(base({ medicalAnswered: 2 }));
    expect(skipped.sections[3].done).toBe(true);
    expect(skipped.sections[3].fraction).toBe(1);
    expect(unanswered.sections[3].done).toBe(false);
    expect(unanswered.sections[3].fraction).toBeGreaterThan(0);
    expect(unanswered.sections[3].fraction).toBeLessThan(1);
  });

  it('counts medical answers without treating the default pregnancy answer as progress', () => {
    expect(countMedicalProgressAnswers({ pregnant: 'No' })).toBe(0);
    expect(countMedicalProgressAnswers({
      heartDisease: 'N',
      injuries: { knees: true, other: '' },
      extraInfo: 'None',
    })).toBe(3);
  });
});
