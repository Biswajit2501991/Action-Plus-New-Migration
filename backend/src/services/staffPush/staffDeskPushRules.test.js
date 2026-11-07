import { describe, expect, it } from 'vitest';
import {
  staffChatBody,
  staffShouldGetChatAlert,
  staffShouldGetVisitorAlert,
} from './staffDeskPushRules.js';

const branchStaff = {
  id: 'desk',
  staffRole: 'staff',
  blocked: false,
  sections: ['Members'],
  access: {},
  gymCodeId: 'branch-a',
  assignedBranchIds: ['branch-a'],
};

const owner = {
  id: 'owner',
  staffRole: 'master_owner',
  blocked: false,
  sections: [],
  access: {},
  assignedBranchIds: [],
};

describe('staff desk push rules', () => {
  it('uses the member name and no message text', () => {
    expect(staffChatBody('Riya Shah')).toBe('Riya Shah has sent a message. Log in to reply.');
    expect(staffChatBody('')).toBe('A member has sent a message. Log in to reply.');
  });

  it('alerts branch staff only for their branch', () => {
    expect(staffShouldGetVisitorAlert(branchStaff, 'branch-a')).toBe(true);
    expect(staffShouldGetVisitorAlert(branchStaff, 'branch-b')).toBe(false);
    expect(staffShouldGetChatAlert(branchStaff, 'branch-a')).toBe(true);
    expect(staffShouldGetChatAlert(branchStaff, 'branch-b')).toBe(false);
  });

  it('alerts the owner for every branch', () => {
    expect(staffShouldGetVisitorAlert(owner, 'branch-b')).toBe(true);
    expect(staffShouldGetChatAlert(owner, 'branch-b')).toBe(true);
  });
});