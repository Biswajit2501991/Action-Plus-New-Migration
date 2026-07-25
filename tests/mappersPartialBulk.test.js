import { describe, expect, it } from 'vitest';
import { appMemberToRow } from '../backend/src/db/supabase/mappers.js';

describe('appMemberToRow partialBulkSync', () => {
  it('omits pay_month when payMonth is absent from bulk payload', () => {
    const row = appMemberToRow({
      memberId: 'APG-1',
      name: 'Test',
      status: 'Active',
      dob: '2000-01-01',
    }, 'gym-1', { partialBulkSync: true });
    expect(row).not.toHaveProperty('pay_month');
  });

  it('includes pay_month when payMonth is present', () => {
    const row = appMemberToRow({
      memberId: 'APG-1',
      name: 'Test',
      status: 'Active',
      dob: '2000-01-01',
      payMonth: '2026-05',
    }, 'gym-1', { partialBulkSync: true });
    expect(row.pay_month).toBe('2026-05');
  });

  it('omits dob when dob is absent from bulk payload', () => {
    const row = appMemberToRow({
      memberId: 'APG-1',
      name: 'Test',
      status: 'Active',
    }, 'gym-1', { partialBulkSync: true });
    expect(row).not.toHaveProperty('dob');
  });

  it('omits dob when bulk payload carries placeholder only', () => {
    const row = appMemberToRow({
      memberId: 'APG-1',
      name: 'Test',
      status: 'Active',
      dob: '1970-01-01',
    }, 'gym-1', { partialBulkSync: true });
    expect(row).not.toHaveProperty('dob');
  });
});
