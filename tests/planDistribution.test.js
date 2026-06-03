import { describe, it, expect } from 'vitest';
import {
  buildMembershipPlanDistribution,
  normalizePlanName,
} from '../src/features/analytics/planDistribution.js';

describe('normalizePlanName', () => {
  it('merges basic variants', () => {
    expect(normalizePlanName('Basic')).toBe('Basic Plan');
    expect(normalizePlanName('basic plan')).toBe('Basic Plan');
  });

  it('uses canonicalPlans when provided', () => {
    expect(normalizePlanName('gold', { canonicalPlans: ['Gold', 'Silver'] })).toBe('Gold');
  });
});

describe('buildMembershipPlanDistribution', () => {
  const members = [
    { plan: 'Basic', status: 'Active' },
    { plan: 'Basic Plan', status: 'Hold' },
    { plan: 'PT-Raja', status: 'Active' },
    { plan: '', status: 'Hold' },
  ];

  it('counts all members by normalized plan', () => {
    const dist = buildMembershipPlanDistribution(members, { topN: 6 });
    const basic = dist.find((d) => d.name === 'Basic Plan');
    expect(basic?.count).toBe(2);
    expect(dist.find((d) => d.name === 'PT-Raja')?.count).toBe(1);
    const unknown = dist.find((d) => d.name === 'Unknown');
    expect(unknown?.count).toBe(1);
  });

  it('finance and dashboard use same counts with same input', () => {
    const dash = buildMembershipPlanDistribution(members, { topN: 6, palette: 'dashboard' });
    const fin = buildMembershipPlanDistribution(members, { topN: 6, palette: 'finance' });
    expect(dash.map((d) => [d.name, d.count])).toEqual(fin.map((d) => [d.name, d.count]));
  });

  it('activeOnly filters statuses', () => {
    const dist = buildMembershipPlanDistribution(members, { activeOnly: true });
    const total = dist.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(2);
  });
});
