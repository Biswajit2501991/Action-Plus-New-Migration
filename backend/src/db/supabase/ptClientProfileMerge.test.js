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
});
