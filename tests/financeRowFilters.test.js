import { describe, it, expect } from 'vitest';
import {
  branchScopeAllowsFinanceRow,
  filterFinanceBulkWriteRows,
  filterFinanceRowsForBranchScope,
  isMirroredMemberPaymentFinanceRow,
  manualIncomeFinanceRows,
} from '../src/features/finance/financeRowFilters.js';

describe('financeRowFilters', () => {
  it('detects imported billing mirror rows', () => {
    expect(isMirroredMemberPaymentFinanceRow({
      note: 'Imported from member billing record',
      source: 'manual',
    })).toBe(true);
    expect(isMirroredMemberPaymentFinanceRow({ source: 'payment' })).toBe(true);
    expect(isMirroredMemberPaymentFinanceRow({ note: 'PT sale', source: 'manual' })).toBe(false);
  });

  it('filterFinanceBulkWriteRows keeps expenses and real manual income', () => {
    const rows = [
      { type: 'expense', amount: 100, note: 'Imported from member billing record' },
      { type: 'income', amount: 500, note: 'Imported from member billing record' },
      { type: 'income', amount: 200, note: 'PT sale', source: 'manual' },
    ];
    const { rows: accepted, strippedMirroredRows } = filterFinanceBulkWriteRows(rows);
    expect(strippedMirroredRows).toBe(1);
    expect(accepted).toHaveLength(2);
    expect(accepted[0].type).toBe('expense');
    expect(accepted[1].amount).toBe(200);
  });

  it('branchScopeAllowsFinanceRow scopes expenses by gymCodeId', () => {
    const scope = {
      limited: true,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      memberCodes: new Set(['APG001']),
    };
    expect(branchScopeAllowsFinanceRow(
      { type: 'expense', amount: 100, gymCodeId: 'branch-a' },
      scope,
    )).toBe(true);
    expect(branchScopeAllowsFinanceRow(
      { type: 'expense', amount: 100, gymCodeId: 'hq' },
      scope,
    )).toBe(false);
    // Legacy untagged expenses remain visible so list matches KPI totals.
    expect(branchScopeAllowsFinanceRow(
      { type: 'expense', amount: 100 },
      scope,
    )).toBe(true);
    expect(branchScopeAllowsFinanceRow({ type: 'income', memberId: 'APG001' }, scope)).toBe(true);
    expect(branchScopeAllowsFinanceRow({ type: 'income', memberId: 'OTHER' }, scope)).toBe(false);
    expect(branchScopeAllowsFinanceRow({ type: 'income' }, scope)).toBe(false);
  });

  it('branchScopeAllowsFinanceRow allows all rows when scope is unlimited', () => {
    const scope = { limited: false, memberCodes: null };
    expect(branchScopeAllowsFinanceRow({ type: 'expense', amount: 50 }, scope)).toBe(true);
    expect(branchScopeAllowsFinanceRow({ type: 'income', memberId: 'X' }, scope)).toBe(true);
  });

  it('filterFinanceRowsForBranchScope keeps matching + untagged expenses', () => {
    const rows = [
      { type: 'expense', amount: 126000, gymCodeId: 'hq' },
      { type: 'expense', amount: 500, gymCodeId: 'kasipure' },
      { type: 'expense', amount: 1200 },
      { type: 'income', amount: 100, memberId: 'APG1' },
    ];
    const filtered = filterFinanceRowsForBranchScope(rows, { gymCodeId: 'kasipure' });
    expect(filtered).toHaveLength(3);
    expect(filtered.filter((r) => r.type === 'expense').map((r) => r.amount).sort((a, b) => a - b)).toEqual([500, 1200]);
    expect(filterFinanceRowsForBranchScope(rows, { gymCodeId: null })).toHaveLength(4);
    expect(filterFinanceRowsForBranchScope(rows, { staffNoBranch: true })).toHaveLength(0);
  });

  it('manualIncomeFinanceRows excludes mirrors only', () => {
    const rows = manualIncomeFinanceRows([
      { type: 'income', note: 'Imported from member billing record' },
      { type: 'income', note: 'Cash sale' },
      { type: 'expense', note: 'Imported from member billing record' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('Cash sale');
  });
});
