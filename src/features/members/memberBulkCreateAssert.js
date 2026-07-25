/**
 * Client/server shared helpers for verifying PUT /members/bulk actually persisted creates.
 * Mirrors frontend/src/lib/domain/member-bulk-create.ts
 */

export function writtenMemberIdsFromBulkResult(result) {
  if (!Array.isArray(result?.written)) return null;
  return new Set(result.written.map((id) => String(id || '').trim()).filter(Boolean));
}

export function assertBulkCreatePersisted(requested, result) {
  const requestedIds = (Array.isArray(requested) ? requested : [])
    .map((m) => String(m?.memberId || '').trim())
    .filter(Boolean);
  if (!requestedIds.length) return [];

  const written = writtenMemberIdsFromBulkResult(result);
  // Legacy API without `written` — caller should confirm via GET.
  if (written == null) {
    if (!result || result.ok === false) {
      throw new Error('Member save was not confirmed by the server.');
    }
    return requestedIds;
  }

  const missing = requestedIds.filter((id) => !written.has(id));
  if (missing.length) {
    const skipped = (result?.skipped || []).join(', ');
    const dropped = (result?.droppedIds || []).join(', ');
    const reason = skipped
      ? `blocked (previously deleted): ${skipped}`
      : dropped
        ? `outside branch scope: ${dropped}`
        : missing.join(', ');
    throw new Error(`Member was not saved: ${reason}`);
  }
  return requestedIds;
}
