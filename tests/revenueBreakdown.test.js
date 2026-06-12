import { describe, it, expect } from 'vitest';
import {
  buildRevenueBreakdown,
  classifyRevenueBucket,
  ptClientMemberIdSet,
} from '../src/features/finance/revenueBreakdown.js';

describe('classifyRevenueBucket', () => {
  it('manual income is Other', () => {
    expect(classifyRevenueBucket({ source: 'manual', type: 'income' }, {})).toBe('other');
  });

  it('orphaned PT profile without PT plan is membership', () => {
    expect(classifyRevenueBucket(
      { source: 'payment', memberId: 'M9', plan: 'Gold' },
      {
        ptClientMemberIds: new Set(['M9']),
        memberById: () => ({ memberId: 'M9', plan: 'Basic', status: 'Active' }),
      },
    )).toBe('membership');
  });

  it('PT client member with PT plan is PT', () => {
    expect(classifyRevenueBucket(
      { source: 'payment', memberId: 'M9', plan: 'Gold' },
      {
        ptClientMemberIds: new Set(['M9']),
        memberById: () => ({ memberId: 'M9', plan: 'PT-Raja', status: 'Active' }),
      },
    )).toBe('pt');
  });

  it('plan containing PT is PT', () => {
    expect(classifyRevenueBucket(
      { source: 'payment', memberId: 'M1', plan: 'PT-Raja' },
      {},
    )).toBe('pt');
  });

  it('payment without PT is membership', () => {
    expect(classifyRevenueBucket(
      { source: 'payment', memberId: 'M1', plan: 'Basic' },
      {},
    )).toBe('membership');
  });
});

describe('buildRevenueBreakdown', () => {
  it('excludes pending and sums buckets', () => {
    const rows = [
      { type: 'income', source: 'payment', status: 'paid', amount: 1000, plan: 'Basic', memberId: 'A' },
      { type: 'income', source: 'payment', status: 'pending', amount: 500, plan: 'Basic', memberId: 'B' },
      { type: 'income', source: 'manual', status: 'paid', amount: 200 },
      { type: 'income', source: 'payment', status: 'paid', amount: 300, plan: 'PT-K', memberId: 'C' },
    ];
    const out = buildRevenueBreakdown(rows, { ptClientMemberIds: new Set() });
    expect(out.membership).toBe(1000);
    expect(out.pt).toBe(300);
    expect(out.other).toBe(200);
    expect(out.total).toBe(1500);
  });
});

describe('ptClientMemberIdSet', () => {
  it('reads keys from settings', () => {
    expect(ptClientMemberIdSet({ ptClientProfiles: { M1: {}, M2: {} } })).toEqual(new Set(['M1', 'M2']));
  });

  it('drops orphaned profile keys when members are provided', () => {
    const members = [
      { memberId: 'M1', plan: 'PT-Raja', status: 'Active' },
      { memberId: 'M2', plan: 'Basic', status: 'Active' },
    ];
    expect(ptClientMemberIdSet({ ptClientProfiles: { M1: {}, M2: {} } }, members)).toEqual(new Set(['M1']));
  });
});
