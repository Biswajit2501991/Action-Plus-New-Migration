import type { Member } from "@/types";

export type MembersBulkWriteResult = {
  ok?: boolean;
  written?: string[];
  skipped?: string[];
  droppedIds?: string[];
};

/** Normalize bulk write response into a set of persisted member IDs (null = legacy API). */
export function writtenMemberIdsFromBulkResult(
  result: MembersBulkWriteResult | null | undefined,
): Set<string> | null {
  if (!Array.isArray(result?.written)) return null;
  return new Set(result.written.map((id) => String(id || "").trim()).filter(Boolean));
}

/**
 * Ensure every requested create/update id was actually persisted.
 * Throws when the API returned ok but omitted ids (silent no-op / blocked).
 */
export function assertBulkCreatePersisted(
  requested: Member[],
  result: MembersBulkWriteResult | null | undefined,
): string[] {
  const requestedIds = (Array.isArray(requested) ? requested : [])
    .map((m) => String(m?.memberId || "").trim())
    .filter(Boolean);
  if (!requestedIds.length) return [];

  const written = writtenMemberIdsFromBulkResult(result);
  // Older API without `written` — cannot verify; caller should confirm via GET.
  if (written == null) {
    if (!result || result.ok === false) {
      throw new Error("Member save was not confirmed by the server.");
    }
    return requestedIds;
  }

  const missing = requestedIds.filter((id) => !written.has(id));
  if (missing.length) {
    const skipped = (result?.skipped || []).join(", ");
    const dropped = (result?.droppedIds || []).join(", ");
    const reason = skipped
      ? `blocked (previously deleted): ${skipped}`
      : dropped
        ? `outside branch scope: ${dropped}`
        : missing.join(", ");
    throw new Error(`Member was not saved: ${reason}`);
  }
  return requestedIds;
}
