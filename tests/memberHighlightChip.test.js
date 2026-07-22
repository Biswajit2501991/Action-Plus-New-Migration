import { describe, it, expect } from 'vitest';

/** Latest timestamp wins between SMS and note. */
function pickHighlight({ smsAt, noteAt }) {
  const smsMs = smsAt ? new Date(smsAt).getTime() : 0;
  const noteMs = noteAt ? new Date(noteAt).getTime() : 0;
  if (!smsMs && !noteMs) return '';
  if (!smsMs) return 'note';
  if (!noteMs) return 'sms';
  return noteMs >= smsMs ? 'note' : 'sms';
}

describe('member highlight chip (latest action)', () => {
  it('shows SMS when only SMS exists', () => {
    expect(pickHighlight({ smsAt: '2026-07-22T14:00:00.000Z' })).toBe('sms');
  });

  it('shows note when only note exists', () => {
    expect(pickHighlight({ noteAt: '2026-07-22T14:00:00.000Z' })).toBe('note');
  });

  it('shows newer note after an older SMS', () => {
    expect(
      pickHighlight({
        smsAt: '2026-07-22T13:00:00.000Z',
        noteAt: '2026-07-22T15:00:00.000Z',
      }),
    ).toBe('note');
  });

  it('shows newer SMS after an older note', () => {
    expect(
      pickHighlight({
        smsAt: '2026-07-22T16:00:00.000Z',
        noteAt: '2026-07-22T15:00:00.000Z',
      }),
    ).toBe('sms');
  });
});
