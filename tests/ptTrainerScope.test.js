import { describe, expect, it } from 'vitest';
import {
  filterPtClientProfilesForTrainerScope,
  ptAssignmentTokens,
  ptClientAssignedToViewer,
  resolveStaffCanonical,
} from '../backend/src/services/pt/ptTrainerScope.js';

describe('ptTrainerScope', () => {
  it('matches PT-Name plan suffixes and trainerId', () => {
    expect(ptAssignmentTokens({ plan: 'PT-Raja' }, null)).toContain('Raja');
    expect(
      ptClientAssignedToViewer(
        { plan: 'PT-Kaushik' },
        {},
        'kaushik',
        'Kaushik',
        new Map([
          ['kaushik', 'kaushik'],
          ['kaushik', 'kaushik'],
        ]),
      ),
    ).toBe(true);

    const alias = new Map([
      ['kaushik', 'kaushik'],
      ['raja', 'raja'],
    ]);
    expect(resolveStaffCanonical('Kaushik', alias)).toBe('kaushik');
    expect(
      ptClientAssignedToViewer({ staff: 'Raja' }, { trainerId: 'raja' }, 'raja', null, alias),
    ).toBe(true);
    expect(
      ptClientAssignedToViewer({ staff: 'Raja' }, { trainerId: 'raja' }, 'kaushik', null, alias),
    ).toBe(false);
  });

  it('filters profiles to the calling trainer only', () => {
    const auth = { userId: 'kaushik', staffRole: 'staff' };
    const profiles = {
      M1: { trainerId: 'kaushik' },
      M2: { trainerId: 'raja' },
      M3: {},
    };
    const out = filterPtClientProfilesForTrainerScope(profiles, auth, new Map(), {
      aliasMap: new Map([
        ['kaushik', 'kaushik'],
        ['raja', 'raja'],
      ]),
      memberPlanByCode: new Map([
        ['M1', 'PT-Kaushik'],
        ['M2', 'PT-Raja'],
        ['M3', 'Personal Training (PT)'],
      ]),
      isAdmin: false,
    });
    expect(Object.keys(out)).toEqual(['M1']);
  });

  it('admins pass through unchanged when isAdmin', () => {
    const profiles = { M1: { trainerId: 'raja' }, M2: { trainerId: 'kaushik' } };
    expect(
      filterPtClientProfilesForTrainerScope(profiles, { userId: 'owner' }, new Map(), {
        isAdmin: true,
      }),
    ).toEqual(profiles);
  });
});
