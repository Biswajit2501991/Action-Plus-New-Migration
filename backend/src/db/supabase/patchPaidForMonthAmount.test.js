import { describe, expect, it } from 'vitest';
import { patchMemberPaidForMonthAmount } from './memberPaidForMonthSync.js';

describe('patchMemberPaidForMonthAmount', () => {
  it('rejects invalid month key', async () => {
    const sb = { from: () => ({}) };
    await expect(patchMemberPaidForMonthAmount(sb, {
      gymId: 'gym-1',
      memberPk: 1,
      memberCode: 'APG-1',
      monthKey: 'bad',
      newAmount: 100,
    })).rejects.toMatchObject({ message: 'invalid-paid-for-month-amount' });
  });
});
