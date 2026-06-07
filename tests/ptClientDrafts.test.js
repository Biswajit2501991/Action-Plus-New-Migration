import { describe, expect, it } from 'vitest';
import {
  buildPtProfilePatch,
  ptDietDraftDirty,
  ptDietDraftFromProfile,
  ptWorkoutNotesDraftFromProfile,
} from '../src/features/pt/ptClientDrafts.js';

describe('ptClientDrafts', () => {
  it('builds profile patch with actor metadata', () => {
    const next = buildPtProfilePatch({ ptWorkoutNotes: 'old' }, { ptWorkoutNotes: 'new' }, 'trainer1');
    expect(next.ptWorkoutNotes).toBe('new');
    expect(next.updatedBy).toBe('trainer1');
    expect(next.updatedAt).toBeTruthy();
  });

  it('detects diet draft changes per client field', () => {
    const profile = { calories: '2000', protein: '150', water: '3', dietPlan: 'High protein' };
    const draft = ptDietDraftFromProfile(profile);
    expect(ptDietDraftDirty(draft, profile)).toBe(false);
    expect(ptDietDraftDirty({ ...draft, calories: '2200' }, profile)).toBe(true);
  });

  it('loads workout notes draft from profile', () => {
    expect(ptWorkoutNotesDraftFromProfile({ ptWorkoutNotes: 'Leg day focus' })).toBe('Leg day focus');
    expect(ptWorkoutNotesDraftFromProfile(null)).toBe('');
  });
});
