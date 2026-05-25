import { describe, expect, it } from 'vitest';
import {
  isMissingOnConflictConstraintError,
  isUniqueViolation,
  syncStaffUserAccess,
  syncStaffUserSections,
} from './staffUserSync.js';

describe('staffUserSync helpers', () => {
  it('detects missing ON CONFLICT constraint errors', () => {
    expect(
      isMissingOnConflictConstraintError({
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      }),
    ).toBe(true);
    expect(isMissingOnConflictConstraintError({ message: 'duplicate key value' })).toBe(false);
  });

  it('detects unique violations', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true);
  });

  it('syncStaffUserSections uses delete then insert without upsert when insert succeeds', async () => {
    const calls = [];
    const sb = {
      from: (table) => ({
        delete: () => ({
          eq: async () => {
            calls.push(`delete:${table}`);
            return { error: null };
          },
        }),
        insert: async (rows) => {
          calls.push(`insert:${table}:${rows.length}`);
          return { error: null };
        },
        upsert: async () => {
          calls.push('upsert:unexpected');
          return { error: null };
        },
      }),
    };
    await syncStaffUserSections(sb, 'pk-1', ['Dashboard', 'Members']);
    expect(calls).toEqual([
      'delete:staff_user_sections',
      'insert:staff_user_sections:2',
    ]);
  });

  it('syncStaffUserAccess uses delete then insert', async () => {
    const calls = [];
    const sb = {
      from: (table) => ({
        delete: () => ({
          eq: async () => {
            calls.push(`delete:${table}`);
            return { error: null };
          },
          in: async () => ({ error: null }),
        }),
        insert: async () => {
          calls.push(`insert:${table}`);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };
    await syncStaffUserAccess(sb, 'pk-2', { editMembers: true });
    expect(calls).toEqual(['delete:staff_user_access', 'insert:staff_user_access']);
  });

  it('syncStaffUserAccess falls back to update on duplicate insert (no upsert)', async () => {
    let insertCalls = 0;
    const sb = {
      from: () => ({
        delete: () => ({
          eq: async () => ({ error: null }),
          in: async () => ({ error: null }),
        }),
        insert: async () => {
          insertCalls += 1;
          if (insertCalls === 1) {
            return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          return { error: null };
        },
        update: () => ({
          eq: async () => {
            return { error: null };
          },
        }),
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ id: 'a1' }], error: null }),
            }),
          }),
        }),
      }),
    };
    await syncStaffUserAccess(sb, 'pk-3', { viewMembers: true });
    expect(insertCalls).toBe(1);
  });
});
