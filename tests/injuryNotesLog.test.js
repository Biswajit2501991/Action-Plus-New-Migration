import { describe, it, expect } from 'vitest';

/** Mirrors index.html parseInjuryNotesLog timestamp normalization. */
function normalizeInjuryNoteAt(entry) {
  return String(entry.at || entry.createdAt || entry.ts || '').trim() || '';
}

describe('injuryNotesLog timestamp normalization', () => {
  it('prefers at, then createdAt, then ts', () => {
    expect(normalizeInjuryNoteAt({ at: '2026-06-01T10:00:00.000Z' })).toBe('2026-06-01T10:00:00.000Z');
    expect(normalizeInjuryNoteAt({ createdAt: '2026-06-02T10:00:00.000Z' })).toBe('2026-06-02T10:00:00.000Z');
    expect(normalizeInjuryNoteAt({ ts: '2026-06-03T10:00:00.000Z' })).toBe('2026-06-03T10:00:00.000Z');
  });
});
