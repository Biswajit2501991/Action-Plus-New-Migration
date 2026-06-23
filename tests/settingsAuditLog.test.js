import { describe, expect, it } from 'vitest';
import { buildSettingsAuditPayload } from '../src/features/audit/settingsAuditLog.js';

describe('buildSettingsAuditPayload', () => {
  it('skips audit when audit:false', () => {
    expect(buildSettingsAuditPayload('plans', ['A'], ['B'], { audit: false })).toBeNull();
  });

  it('uses baseline for before on generic settings keys', () => {
    const payload = buildSettingsAuditPayload('plans', ['A', 'B'], ['A']);
    expect(payload).toEqual({
      entityId: 'plans',
      before: ['A', 'B'],
      after: ['A'],
    });
  });

  it('logs only one PT member profile slice', () => {
    const baseline = {
      'APG-001/26': { focusArea: 'Back', updatedAt: '2026-06-01' },
      'APG-002/26': { focusArea: 'Legs' },
    };
    const nextValue = {
      'APG-001/26': { focusArea: 'Chest', updatedAt: '2026-06-02' },
      'APG-002/26': { focusArea: 'Legs' },
    };
    const payload = buildSettingsAuditPayload('ptClientProfiles', baseline, nextValue, {
      memberId: 'APG-001/26',
    });
    expect(payload?.entityId).toBe('ptClientProfiles:APG-001/26');
    expect(payload?.before).toEqual({ focusArea: 'Back', updatedAt: '2026-06-01' });
    expect(payload?.after).toEqual({ focusArea: 'Chest', updatedAt: '2026-06-02' });
  });

  it('returns null member slice when member missing from both sides', () => {
    const payload = buildSettingsAuditPayload('ptClientProfiles', {}, {}, { memberId: 'APG-999/26' });
    expect(payload).toEqual({
      entityId: 'ptClientProfiles:APG-999/26',
      before: null,
      after: null,
    });
  });
});
