import {
  prepareMembersBulkWrite,
  assertMembersBulkWriteNonEmpty,
  assertMembersBulkPersisted,
  assertStaffHasBranchForWrite,
} from '../../auth/branchScope.js';
import { assertBranchWriteAllowed } from '../../auth/branchFilter.js';
import { readMember, writeJsonCollection } from '../../db/dataStore.js';

/**
 * Durable single-member create.
 * Stamps branch, writes, then reads back — never returns success without a persisted row.
 *
 * @param {object} member app-shaped member
 * @param {object} auth req.auth
 * @param {object|null} branchScope
 * @param {object|null} scope sandbox
 * @returns {Promise<object>} saved member
 */
export async function createMemberDurable(member, auth, branchScope = null, scope = null) {
  assertStaffHasBranchForWrite(auth);
  const incoming = member && typeof member === 'object' ? [member] : [];
  if (!incoming.length || !String(incoming[0]?.memberId || '').trim()) {
    const err = new Error('member-code-required');
    err.status = 400;
    throw err;
  }

  assertBranchWriteAllowed(incoming, auth);
  const { prepared, droppedIds } = prepareMembersBulkWrite(incoming, auth);
  assertMembersBulkWriteNonEmpty(incoming.length, prepared, droppedIds);

  const writeResult = await writeJsonCollection('apg.members', prepared, scope, {});
  const written = Array.isArray(writeResult?.written)
    ? writeResult.written
    : prepared.map((m) => String(m?.memberId || '').trim()).filter(Boolean);
  const skipped = Array.isArray(writeResult?.skipped) ? writeResult.skipped : [];
  assertMembersBulkPersisted(
    prepared.map((m) => String(m?.memberId || '').trim()).filter(Boolean),
    written,
    skipped,
  );

  const code = String(written[0] || prepared[0]?.memberId || '').trim();
  const saved = await readMember(code, branchScope);
  if (!saved) {
    const err = new Error('member-create-not-readable');
    err.status = 500;
    err.detail = {
      memberId: code,
      hint: 'Row was written but could not be read back in the current branch scope.',
    };
    throw err;
  }
  return saved;
}
