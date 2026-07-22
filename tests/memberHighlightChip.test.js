import { describe, it, expect } from 'vitest';

/**
 * Mirrors getMemberHighlightChipText priority:
 * SMS for primary action → newest other SMS → note.
 */
function pickHighlight({ primarySms, otherSms, note }) {
  if (primarySms) return 'primarySms';
  if (otherSms) return 'otherSms';
  if (note) return 'note';
  return '';
}

describe('member highlight chip (SMS vs note)', () => {
  it('prefers primary SMS over note', () => {
    expect(pickHighlight({ primarySms: true, note: true })).toBe('primarySms');
  });

  it('uses other SMS (e.g. fine) when primary has none', () => {
    expect(pickHighlight({ otherSms: true, note: true })).toBe('otherSms');
  });

  it('falls back to note when no SMS', () => {
    expect(pickHighlight({ note: true })).toBe('note');
  });

  it('shows nothing when empty', () => {
    expect(pickHighlight({})).toBe('');
  });
});
