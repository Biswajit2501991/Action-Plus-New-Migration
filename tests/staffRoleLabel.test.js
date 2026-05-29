import { describe, it, expect } from 'vitest';
import { staffRoleDisplayLabel } from '../src/features/branding/staffRoleLabel.js';

describe('staffRoleDisplayLabel', () => {
  it('maps master owner login and role', () => {
    expect(staffRoleDisplayLabel({ id: 'owner' })).toBe('Master Owner');
    expect(staffRoleDisplayLabel({ id: 'x', staffRole: 'master_owner' })).toBe('Master Owner');
  });

  it('maps branch owner', () => {
    expect(staffRoleDisplayLabel({ id: 'raja', staffRole: 'branch_owner' })).toBe('Branch Owner');
  });

  it('defaults to staff', () => {
    expect(staffRoleDisplayLabel({ id: 'rec', staffRole: 'staff' })).toBe('Staff');
    expect(staffRoleDisplayLabel(null)).toBe('Staff');
  });
});
