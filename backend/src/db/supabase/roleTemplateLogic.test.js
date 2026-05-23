import { describe, expect, it } from 'vitest';
import {
  dedupeRoleTemplates,
  stableRoleTemplateId,
} from './roleTemplateLogic.js';

describe('stableRoleTemplateId', () => {
  it('keeps slug ids like frontdesk', () => {
    expect(stableRoleTemplateId({ id: 'frontdesk', title: 'Front Desk Manager' })).toBe('frontdesk');
  });

  it('uses title slug when id is a database uuid', () => {
    expect(
      stableRoleTemplateId({
        id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        title: 'Front Desk Manager',
      }),
    ).toBe('front-desk-manager');
  });
});

describe('dedupeRoleTemplates', () => {
  it('collapses duplicate Front Desk Manager rows', () => {
    const out = dedupeRoleTemplates([
      { id: 'frontdesk', title: 'Front Desk Manager', sections: ['Dashboard', 'Members', 'Finance'] },
      {
        id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        title: 'Front Desk Manager',
        sections: ['Dashboard'],
      },
      {
        id: 'b2c3d4e5-f6a7-4890-b123-456789abcdef0',
        title: 'Front Desk Manager',
        sections: ['Dashboard', 'Members'],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('frontdesk');
    expect(out[0].title).toBe('Front Desk Manager');
  });
});
