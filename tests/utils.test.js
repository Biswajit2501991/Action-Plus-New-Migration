import { describe, expect, it } from 'vitest';
import { addDays, addMonths, applyMemberFilters, billingMonthLabel, sanitizeForLog } from '../src/lib/utils.js';
import { safeSetJSON } from '../src/lib/storage.js';

describe('date utilities', () => {
  it('builds billing month label', () => {
    expect(billingMonthLabel('2026-01-14')).toBe('Jan-2026');
  });

  it('adds days and months in UTC', () => {
    expect(addDays('2026-01-14', 7).toISOString().slice(0, 10)).toBe('2026-01-21');
    expect(addMonths('2026-01-14', 1).toISOString().slice(0, 10)).toBe('2026-02-14');
  });
});

describe('member filters', () => {
  const rows = [
    { plan: 'Basic', status: 'Active', paymentMethod: 'Cash', staff: 'Owner', billingDate: '2026-01-14' },
    { plan: 'PT-Raja', status: 'Hold', paymentMethod: 'Google Pay', staff: 'Bis', billingDate: '2026-02-14' },
  ];

  it('filters by status and plan', () => {
    expect(applyMemberFilters(rows, { status: 'Active' })).toHaveLength(1);
    expect(applyMemberFilters(rows, { plan: 'PT-Raja', status: 'Hold' })).toHaveLength(1);
  });
});

describe('log sanitization', () => {
  it('redacts password and image', () => {
    const out = sanitizeForLog({ password: 'secret', photo: 'data:image/png;base64,abc' });
    expect(out.password).toBe('[redacted]');
    expect(out.photo).toBe('[image]');
  });
});

describe('safe storage writer', () => {
  it('prevents oversized payload', () => {
    const mock = {
      store: new Map(),
      get length() { return this.store.size; },
      key(i) { return Array.from(this.store.keys())[i] || null; },
      getItem(k) { return this.store.get(k) || null; },
      setItem(k, v) { this.store.set(k, v); },
    };
    const result = safeSetJSON(mock, 'k', { s: 'x'.repeat(1000) }, 100);
    expect(result.ok).toBe(false);
  });
});
