import { describe, it, expect } from 'vitest';
import {
  isPtEligibleMember,
  isPtPlanName,
  PT_PLAN_RE,
} from '../src/features/pt/ptEligibility.js';

describe('isPtPlanName', () => {
  it('matches PT-prefixed plans', () => {
    expect(isPtPlanName('PT-Raja')).toBe(true);
    expect(isPtPlanName('PT-Kaushik')).toBe(true);
    expect(isPtPlanName('PT-Deep')).toBe(true);
  });

  it('does not match Basic', () => {
    expect(isPtPlanName('Basic')).toBe(false);
  });
});

describe('isPtEligibleMember', () => {
  it('requires Active status and PT plan', () => {
    expect(isPtEligibleMember({ status: 'Active', plan: 'PT-Raja' })).toBe(true);
    expect(isPtEligibleMember({ status: 'Active', plan: 'Basic' })).toBe(false);
    expect(isPtEligibleMember({ status: 'Hold', plan: 'PT-Raja' })).toBe(false);
  });
});

describe('PT_PLAN_RE', () => {
  it('is exported for finance reuse', () => {
    expect(PT_PLAN_RE.test('Personal Training (PT)')).toBe(true);
  });
});
