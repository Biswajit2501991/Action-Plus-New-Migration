import { describe, expect, it } from 'vitest';
import {
  filterPtClientProfilesForTrainerScope,
  ptAssignmentTokens,
  ptClientAssignedToViewer,
  resolveStaffCanonical,
  staffTokenMatchesViewer,
} from '../backend/src/services/pt/ptTrainerScope.js';

describe('ptTrainerScope', () => {
  it('matches PT-Name plan suffixes and trainerId', () => {
    expect(ptAssignmentTokens({ plan: 'PT-Raja' }, null)).toContain('Raja');
    expect(ptAssignmentTokens({ plan: 'PT-Raja' }, null)).not.toContain('Deep');
    expect(
      ptAssignmentTokens({ plan: 'PT-Raja', staff: 'Deep' }, null),
    ).toEqual(expect.not.arrayContaining(['Deep']));

    expect(
      ptClientAssignedToViewer(
        { plan: 'PT-Kaushik' },
        {},
        'kaushik',
        'Kaushik',
        new Map([
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
      ptClientAssignedToViewer({ plan: 'PT-Raja' }, { trainerId: 'raja' }, 'raja', null, alias),
    ).toBe(true);
    expect(
      ptClientAssignedToViewer({ plan: 'PT-Raja' }, { trainerId: 'raja' }, 'kaushik', null, alias),
    ).toBe(false);
  });

  it('matches staff login Koushik to plan PT-Kaushik (spelling alias)', () => {
    expect(
      ptClientAssignedToViewer(
        { plan: 'PT-Kaushik', staff: 'Deep' },
        {},
        'Koushik',
        'Koushik',
        new Map([['koushik', 'koushik']]),
      ),
    ).toBe(true);
    expect(
      ptClientAssignedToViewer(
        { plan: 'PT-Raja', staff: 'Koushik' },
        {},
        'Koushik',
        'Koushik',
        new Map([['koushik', 'koushik']]),
      ),
    ).toBe(false);
  });

  it('matches short plan suffix to longer staff login (Bis → Biswajit)', () => {
    expect(staffTokenMatchesViewer('bis', new Set(['biswajit']))).toBe(true);
    expect(
      ptClientAssignedToViewer({ plan: 'PT-Bis' }, {}, 'Biswajit', 'Biswajit', null),
    ).toBe(true);
    expect(
      ptClientAssignedToViewer(
        { plan: 'PT-Raja', staff: 'Biswajit' },
        {},
        'Biswajit',
        'Biswajit',
        null,
      ),
    ).toBe(false);
  });

  it('uses enrollment staff only for generic PT plans', () => {
    expect(
      ptAssignmentTokens({ plan: 'Personal Training (PT)', staff: 'Biswajit' }, null),
    ).toContain('Biswajit');
    expect(
      ptClientAssignedToViewer(
        { plan: 'Personal Training (PT)', staff: 'Biswajit' },
        {},
        'Biswajit',
        null,
        null,
      ),
    ).toBe(true);
  });

  it('filters profiles to the calling trainer only', () => {
    const auth = { userId: 'Koushik', staffRole: 'staff' };
    const profiles = {
      M1: { trainerId: 'kaushik' },
      M2: { trainerId: 'raja' },
      M3: {},
    };
    const out = filterPtClientProfilesForTrainerScope(profiles, auth, new Map(), {
      aliasMap: new Map([
        ['koushik', 'koushik'],
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
