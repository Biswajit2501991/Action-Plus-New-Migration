import { chunk, fetchAll } from './utils.js';

/**
 * Upsert gym-scoped rows by external id; remove DB rows not present in payload (scoped delete).
 * Falls back to per-row delete+insert if bulk upsert fails (e.g. missing UNIQUE).
 */
export async function syncGymRowsByExternalId(sb, table, {
  gymId,
  externalIdColumn,
  rows,
  onConflict,
  deleteOrphans = true,
}) {
  const gid = gymId;
  const incoming = (rows || []).filter((r) => {
    const id = r?.[externalIdColumn];
    return id != null && String(id).trim() !== '';
  });
  const incomingIds = new Set(incoming.map((r) => String(r[externalIdColumn])));

  if (deleteOrphans) {
    const existing = await fetchAll((from, to) =>
      sb.from(table).select(externalIdColumn).eq('gym_id', gid).range(from, to));
    const toRemove = (existing || [])
      .map((r) => String(r[externalIdColumn] || ''))
      .filter((id) => id && !incomingIds.has(id));
    for (const idChunk of chunk(toRemove, 100)) {
      const { error } = await sb.from(table).delete().eq('gym_id', gid).in(externalIdColumn, idChunk);
      if (error) throw new Error(`${table} orphan delete: ${error.message}`);
    }
  }

  for (const part of chunk(incoming, 80)) {
    if (!part.length) continue;
    const { error } = await sb.from(table).upsert(part, { onConflict });
    if (!error) continue;
    for (const row of part) {
      const extId = row[externalIdColumn];
      await sb.from(table).delete().eq('gym_id', gid).eq(externalIdColumn, extId);
      const { error: insErr } = await sb.from(table).insert(row);
      if (insErr) throw new Error(`${table} ${extId}: ${insErr.message}`);
    }
  }
}

/**
 * Sync child rows for one member by external id (attachments: full replace per member).
 */
export async function syncMemberChildRows(sb, table, {
  gymId,
  memberId,
  externalIdColumn,
  rows,
  onConflict,
}) {
  const incoming = (rows || []).filter((r) => {
    if (!externalIdColumn) return true;
    const id = r?.[externalIdColumn];
    return id != null && String(id).trim() !== '';
  });

  if (!externalIdColumn) {
    const { error: delErr } = await sb.from(table).delete().eq('member_id', memberId);
    if (delErr) throw delErr;
    for (const part of chunk(incoming, 80)) {
      if (!part.length) continue;
      const { error } = await sb.from(table).insert(part);
      if (error) throw new Error(`${table} insert: ${error.message}`);
    }
    return;
  }

  const { data: existing, error: selErr } = await sb
    .from(table)
    .select(externalIdColumn)
    .eq('gym_id', gymId)
    .eq('member_id', memberId);
  if (selErr) throw selErr;

  const incomingIds = new Set(incoming.map((r) => String(r[externalIdColumn])));
  const toRemove = (existing || [])
    .map((r) => String(r[externalIdColumn] || ''))
    .filter((id) => id && !incomingIds.has(id));

  if (toRemove.length) {
    const { error } = await sb
      .from(table)
      .delete()
      .eq('member_id', memberId)
      .in(externalIdColumn, toRemove);
    if (error) throw new Error(`${table} child orphan delete: ${error.message}`);
  }

  for (const part of chunk(incoming, 80)) {
    if (!part.length) continue;
    const { error } = await sb.from(table).upsert(part, { onConflict });
    if (!error) continue;
    for (const row of part) {
      const extId = row[externalIdColumn];
      await sb.from(table).delete().eq('member_id', memberId).eq(externalIdColumn, extId);
      const { error: insErr } = await sb.from(table).insert(row);
      if (insErr) throw new Error(`${table} child ${extId}: ${insErr.message}`);
    }
  }
}
