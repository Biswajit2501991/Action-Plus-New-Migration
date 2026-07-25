import { describe, expect, it } from 'vitest';
import {
  assertBulkCreatePersisted,
  writtenMemberIdsFromBulkResult,
} from '../src/features/members/memberBulkCreateAssert.js';

describe('assertBulkCreatePersisted', () => {
  it('accepts written ids from modern API', () => {
    const ids = assertBulkCreatePersisted(
      [{ memberId: 'APG-9/26' }],
      { ok: true, written: ['APG-9/26'] },
    );
    expect(ids).toEqual(['APG-9/26']);
  });

  it('rejects silent success when written omits the new member', () => {
    expect(() =>
      assertBulkCreatePersisted(
        [{ memberId: 'APG-9/26' }],
        { ok: true, written: [], skipped: ['APG-9/26'] },
      ),
    ).toThrow(/not saved/);
  });

  it('rejects dropped branch-scope creates reported by API', () => {
    expect(() =>
      assertBulkCreatePersisted(
        [{ memberId: 'APG-9/26' }],
        { ok: true, written: [], droppedIds: ['APG-9/26'] },
      ),
    ).toThrow(/outside branch scope/);
  });

  it('legacy ok without written falls through for GET confirmation', () => {
    const ids = assertBulkCreatePersisted([{ memberId: 'APG-1' }], { ok: true });
    expect(ids).toEqual(['APG-1']);
    expect(writtenMemberIdsFromBulkResult({ ok: true })).toBeNull();
  });
});
