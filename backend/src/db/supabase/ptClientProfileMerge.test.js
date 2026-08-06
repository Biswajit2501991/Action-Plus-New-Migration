import { describe, expect, it } from 'vitest';
import { mergePtProfilePlanJson } from './repository.js';

describe('mergePtProfilePlanJson', () => {
  it('replaces focusByDate when patch includes it (Clear for Day deletions persist)', () => {
    const prev = {
      focusByDate: { '2025-06-04': 'Chest', '2025-06-05': 'Back' },
      ptWorkoutNotes: 'keep',
    };
    const incoming = {
      focusByDate: { '2025-06-05': 'Back' },
      focusArea: '',
    };
    const merged = mergePtProfilePlanJson(prev, incoming);
    expect(merged.focusByDate).toEqual({ '2025-06-05': 'Back' });
    expect(merged.ptWorkoutNotes).toBe('keep');
  });

  it('preserves focusByDate when patch omits it', () => {
    const prev = {
      focusByDate: { '2025-06-04': 'Chest' },
    };
    const merged = mergePtProfilePlanJson(prev, { ptWorkoutNotes: 'updated' });
    expect(merged.focusByDate).toEqual({ '2025-06-04': 'Chest' });
    expect(merged.ptWorkoutNotes).toBe('updated');
  });

  it('clears all focus days when patch sends empty focusByDate', () => {
    const prev = {
      focusByDate: { '2025-06-04': 'Chest' },
    };
    const merged = mergePtProfilePlanJson(prev, { focusByDate: {} });
    expect(merged.focusByDate).toEqual({});
  });

  it('unions chat by id so stale trainer saves cannot wipe member messages', () => {
    const prev = {
      chat: [
        { id: 'm1', from: 'member', text: 'Hi', ts: '2026-08-06T10:00:00.000Z' },
      ],
      lastMemberChatAt: '2026-08-06T10:00:00.000Z',
    };
    const incoming = {
      chat: [
        { id: 't1', from: 'trainer', text: 'Reply', ts: '2026-08-06T10:01:00.000Z' },
      ],
      lastTrainerChatAt: '2026-08-06T10:01:00.000Z',
      ptWorkoutNotes: 'note',
    };
    const merged = mergePtProfilePlanJson(prev, incoming);
    expect(merged.chat.map((m) => m.id)).toEqual(['t1', 'm1']);
    expect(merged.lastMemberChatAt).toBe('2026-08-06T10:00:00.000Z');
    expect(merged.lastTrainerChatAt).toBe('2026-08-06T10:01:00.000Z');
    expect(merged.ptWorkoutNotes).toBe('note');
  });
});
