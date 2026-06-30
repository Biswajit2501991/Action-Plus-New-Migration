import { describe, it, expect } from 'vitest';
import {
  buildFinanceKpis,
  revenueGrowthPercent,
  shiftFinanceMonthKey,
  sumYtdCollectedIncome,
} from '../src/features/finance/buildFinanceKpis.js';

describe('buildFinanceKpis', () => {
  const ledger = [
    { type: 'income', date: '2026-05-10', amount: 1000, status: 'paid' },
    { type: 'income', date: '2026-05-20', amount: 500, status: 'pending' },
    { type: 'income', date: '2026-06-01', amount: 800, status: 'paid' },
    { type: 'expense', date: '2026-06-05', amount: 200, status: 'posted', category: 'Rent' },
  ];

  it('revenue is collected only (excludes pending)', () => {
    const kpis = buildFinanceKpis(ledger, '2026-05', { financeUseEstimatedExpense: false });
    expect(kpis.collectedRevenue).toBe(1000);
    expect(kpis.pendingBilled).toBe(500);
  });

  it('service revenue uses paidMonth on Active member ledger rows only', () => {
    const rows = [
      { type: 'income', date: '2026-07-02', paidMonth: '2026-05', amount: 900, status: 'paid', memberStatus: 'Active' },
      { type: 'income', date: '2026-05-10', paidMonth: '2026-05', amount: 100, status: 'paid', memberStatus: 'Active' },
      { type: 'income', date: '2026-06-01', paidMonth: '2026-06', amount: 800, status: 'paid', memberStatus: 'Hold' },
    ];
    const kpis = buildFinanceKpis(rows, '2026-05', { financeUseEstimatedExpense: false });
    expect(kpis.collectedRevenue).toBe(100);
    expect(kpis.serviceRevenue).toBe(1000);
  });

  it('profit uses reporting month expenses not search filters', () => {
    const kpis = buildFinanceKpis(ledger, '2026-06', { financeUseEstimatedExpense: false });
    expect(kpis.actualExpense).toBe(200);
    expect(kpis.expense).toBe(200);
    expect(kpis.profit).toBe(600);
  });

  it('falls back to 26% estimate only when setting on or no expense rows', () => {
    const noExp = buildFinanceKpis(
      [{ type: 'income', date: '2026-06-01', amount: 1000, status: 'paid' }],
      '2026-06',
      { financeUseEstimatedExpense: false },
    );
    expect(noExp.useEstimateFallback).toBe(true);
    expect(noExp.expense).toBe(260);

    const estimated = buildFinanceKpis(
      [{ type: 'income', date: '2026-06-01', amount: 1000, status: 'paid' }],
      '2026-06',
      { financeUseEstimatedExpense: true },
    );
    expect(estimated.expense).toBe(260);
  });

  it('uses actual expenses for profit when rows exist even in estimate mode', () => {
    const kpis = buildFinanceKpis(ledger, '2026-06', { financeUseEstimatedExpense: true });
    expect(kpis.expense).toBe(200);
    expect(kpis.profit).toBe(600);
    expect(kpis.expenseSubtitle).toBe('Actual expense rows');
  });
});

describe('shiftFinanceMonthKey', () => {
  it('steps to previous month', () => {
    expect(shiftFinanceMonthKey('2026-01', -1)).toBe('2025-12');
  });
});

describe('revenueGrowthPercent', () => {
  it('returns 100 when previous is zero and current positive', () => {
    expect(revenueGrowthPercent(500, 0)).toBe(100);
  });
});

describe('sumYtdCollectedIncome', () => {
  it('sums Jan through throughMonth', () => {
    const rows = [
      { type: 'income', date: '2026-01-15', amount: 100, status: 'paid' },
      { type: 'income', date: '2026-03-01', amount: 50, status: 'paid' },
    ];
    expect(sumYtdCollectedIncome(rows, 2026, 3)).toBe(150);
  });
});
