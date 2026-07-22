import { describe, it, expect } from 'vitest';

/**
 * Mirrors frontend getMemberHighlightChipText / getInjuryNoteInfoText selection.
 * Keeps SMS chip when newer; otherwise shows latest note.
 */
function pickHighlight({ smsAt, noteAt }) {
  const smsMs = smsAt ? new Date(smsAt).getTime() : 0;
  const noteMs = noteAt ? new Date(noteAt).getTime() : 0;
  if (!smsMs) return 'note';
  if (!noteMs) return 'sms';
  return noteMs >= smsMs ? 'note' : 'sms';
}

describe('member highlight chip (SMS vs note)', () => {
  it('shows note when no SMS', () => {
    expect(pickHighlight({ noteAt: '2026-07-22T10:00:00.000Z' })).toBe('note');
  });

  it('shows SMS when no note', () => {
    expect(pickHighlight({ smsAt: '2026-07-22T10:00:00.000Z' })).toBe('sms');
  });

  it('prefers newer note over older SMS', () => {
    expect(
      pickHighlight({
        smsAt: '2026-07-22T10:00:00.000Z',
        noteAt: '2026-07-22T12:00:00.000Z',
      }),
    ).toBe('note');
  });

  it('prefers newer SMS over older note', () => {
    expect(
      pickHighlight({
        smsAt: '2026-07-22T14:00:00.000Z',
        noteAt: '2026-07-22T12:00:00.000Z',
      }),
    ).toBe('sms');
  });
});
