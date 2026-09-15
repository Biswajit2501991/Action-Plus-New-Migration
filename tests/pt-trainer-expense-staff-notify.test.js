import { describe, expect, it } from 'vitest';
import { staffMayReceivePtPayoutStaffNotify } from '../backend/src/services/ptTrainerExpenseService.js';

describe('staffMayReceivePtPayoutStaffNotify', () => {
  const pending = {
    trainerStaffLoginId: 'raja',
    assignedGymCodeId: 'b1',
  };

  it('denies when master staff notify toggle is off', () => {
    expect(
      staffMayReceivePtPayoutStaffNotify(
        { userId: 'manager1', staffRole: 'staff', sections: ['Finance'] },
        pending,
        { ptTrainerExpenseNotifyStaffEnabled: false, ptTrainerExpenseNotifyStaffRoles: ['finance'] },
        [],
      ),
    ).toBe(false);
  });

  it('denies trainer of the pending row', () => {
    expect(
      staffMayReceivePtPayoutStaffNotify(
        { userId: 'raja', staffRole: 'staff', sections: ['Finance'] },
        pending,
        {
          ptTrainerExpenseNotifyStaffEnabled: true,
          ptTrainerExpenseNotifyStaffRoles: ['finance'],
        },
        [],
      ),
    ).toBe(false);
  });

  it('allows finance role token when staff has Finance section', () => {
    expect(
      staffMayReceivePtPayoutStaffNotify(
        { userId: 'desk1', staffRole: 'staff', sections: ['Finance', 'Members'] },
        pending,
        {
          ptTrainerExpenseNotifyStaffEnabled: true,
          ptTrainerExpenseNotifyStaffRoles: ['finance'],
        },
        [],
      ),
    ).toBe(true);
  });

  it('allows explicit staff id', () => {
    expect(
      staffMayReceivePtPayoutStaffNotify(
        { userId: 'deep', staffRole: 'staff', sections: [] },
        pending,
        {
          ptTrainerExpenseNotifyStaffEnabled: true,
          ptTrainerExpenseNotifyStaffRoles: [],
          ptTrainerExpenseNotifyStaffIds: ['deep'],
        },
        [],
      ),
    ).toBe(true);
  });

  it('denies when enabled but roles and ids empty', () => {
    expect(
      staffMayReceivePtPayoutStaffNotify(
        { userId: 'desk1', staffRole: 'staff', sections: ['Finance'] },
        pending,
        {
          ptTrainerExpenseNotifyStaffEnabled: true,
          ptTrainerExpenseNotifyStaffRoles: [],
          ptTrainerExpenseNotifyStaffIds: [],
        },
        [],
      ),
    ).toBe(false);
  });
});
