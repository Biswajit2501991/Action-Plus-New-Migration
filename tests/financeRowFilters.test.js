import { describe, it, expect } from 'vitest';
import {
  branchScopeAllowsFinanceRow,
  filterFinanceBulkWriteRows,
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

  it('branchScopeAllowsFinanceRow allows expenses without memberId', () => {
    const scope = { memberCodes: new Set(['APG001']) };
    expect(branchScopeAllowsFinanceRow({ type: 'expense', amount: 100 }, scope)).toBe(true);
    expect(branchScopeAllowsFinanceRow({ type: 'income', memberId: 'APG001' }, scope)).toBe(true);
    expect(branchScopeAllowsFinanceRow({ type: 'income', memberId: 'OTHER' }, scope)).toBe(false);
    expect(branchScopeAllowsFinanceRow({ type: 'income' }, scope)).toBe(false);
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
