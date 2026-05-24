import { describe, expect, it } from 'vitest';
import { Access, isAccessAllowed, normalizeAccess } from './accessControl.js';

describe('normalizeAccess', () => {
  it('defaults missing keys to allowed (opt-out model)', () => {
    const access = normalizeAccess({});
    expect(access.members.viewMembers).toBe(true);
    expect(access.finance.manageExpenses).toBe(true);
  });

  it('honours explicit false', () => {
    const access = normalizeAccess({ members: { viewMembers: false, editMembers: false } });
    expect(access.members.viewMembers).toBe(false);
    expect(access.members.editMembers).toBe(false);
  });
});

describe('Access checks', () => {
  it('owner wildcard allows all', () => {
    const denied = normalizeAccess({ members: { viewMembers: false } });
    expect(isAccessAllowed({ __owner: true }, Access.membersRead)).toBe(true);
    expect(isAccessAllowed(denied, Access.membersRead)).toBe(false);
  });

  it('membersWrite requires edit, add, or delete', () => {
    const viewOnly = normalizeAccess({ members: { viewMembers: true, editMembers: false, addMembers: false, deleteMembers: false } });
    expect(isAccessAllowed(viewOnly, Access.membersWrite)).toBe(false);
    const canEdit = normalizeAccess({ members: { editMembers: true } });
    expect(isAccessAllowed(canEdit, Access.membersWrite)).toBe(true);
  });

  it('financeRead accepts any finance view flag', () => {
    const partial = normalizeAccess({
      finance: {
        viewRevenueAutoMembers: false,
        viewRevenueTrend4Months: false,
        viewPlanPopularity: false,
        viewTransactionsAutoMembers: true,
        viewPendingPayments: false,
        viewExpenseCard: false,
        viewProfitCard: false,
        manageExpenses: false,
      },
    });
    expect(isAccessAllowed(partial, Access.financeRead)).toBe(true);
  });

  it('ptClientsWriteWorkout allows staff with editPtWorkout', () => {
    const trainer = normalizeAccess({ ptClients: { viewPtClients: true, editPtWorkout: true, editPtPlan: false } });
    expect(isAccessAllowed(trainer, Access.ptClientsRead)).toBe(true);
    expect(isAccessAllowed(trainer, Access.ptClientsWriteWorkout)).toBe(true);
    expect(isAccessAllowed(trainer, Access.ptClientsWritePlan)).toBe(false);
  });

  it('ptClientsWriteWorkout denies view-only PT staff', () => {
    const viewOnly = normalizeAccess({ ptClients: { viewPtClients: true, editPtWorkout: false, editPtPlan: false } });
    expect(isAccessAllowed(viewOnly, Access.ptClientsRead)).toBe(true);
    expect(isAccessAllowed(viewOnly, Access.ptClientsWriteWorkout)).toBe(false);
  });
});
