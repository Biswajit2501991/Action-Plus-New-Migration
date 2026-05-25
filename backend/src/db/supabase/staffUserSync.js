import { T } from '../tables.js';

/** Postgres / PostgREST when upsert onConflict has no matching UNIQUE index. */
export function isMissingOnConflictConstraintError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('no unique or exclusion constraint')
    || msg.includes('there is no unique')
    || (msg.includes('on conflict') && msg.includes('constraint'));
}

export function isUniqueViolation(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('duplicate key')
    || msg.includes('unique constraint')
    || String(err?.code || '') === '23505';
}

/**
 * Replace section rows for one staff user. No upsert / ON CONFLICT (works without DB indexes).
 */
export async function syncStaffUserSections(sb, staffPk, sections) {
  const names = [...new Set((Array.isArray(sections) ? sections : []).map((n) => String(n).trim()).filter(Boolean))];
  const { error: delErr } = await sb.from(T.staff_user_sections).delete().eq('staff_user_id', staffPk);
  if (delErr) throw delErr;
  if (!names.length) return;

  const rows = names.map((section_name) => ({ staff_user_id: staffPk, section_name }));
  const { error: insErr } = await sb.from(T.staff_user_sections).insert(rows);
  if (!insErr) return;

  if (!isUniqueViolation(insErr)) throw insErr;

  // Concurrent save or leftover rows: clear and insert one section at a time (no upsert).
  await sb.from(T.staff_user_sections).delete().eq('staff_user_id', staffPk);
  for (const section_name of names) {
    await sb
      .from(T.staff_user_sections)
      .delete()
      .eq('staff_user_id', staffPk)
      .eq('section_name', section_name);
    const { error: rowErr } = await sb.from(T.staff_user_sections).insert({ staff_user_id: staffPk, section_name });
    if (rowErr) throw new Error(`staff_user_sections sync failed: ${rowErr.message}`);
  }
}

/**
 * Replace the single access_json row for one staff user. No upsert / ON CONFLICT.
 */
export async function syncStaffUserAccess(sb, staffPk, access) {
  const access_json = access && typeof access === 'object' ? access : {};
  const { error: delErr } = await sb.from(T.staff_user_access).delete().eq('staff_user_id', staffPk);
  if (delErr) throw delErr;

  const row = { staff_user_id: staffPk, access_json };
  const { error: insErr } = await sb.from(T.staff_user_access).insert(row);
  if (!insErr) return;

  if (!isUniqueViolation(insErr)) throw insErr;

  // Duplicate row still present (race) or UNIQUE index exists — update all rows for this staff (no ON CONFLICT).
  const { error: upErr } = await sb.from(T.staff_user_access).update({ access_json }).eq('staff_user_id', staffPk);
  if (upErr) throw new Error(`staff_user_access sync failed: ${insErr.message}; update: ${upErr.message}`);

  // Collapse accidental duplicates when there is no unique index (update touched multiple rows).
  const { data: extras, error: selErr } = await sb
    .from(T.staff_user_access)
    .select('id')
    .eq('staff_user_id', staffPk)
    .order('id', { ascending: false });
  if (selErr) return;
  const ids = (extras || []).map((r) => r.id).filter(Boolean);
  if (ids.length > 1) {
    await sb.from(T.staff_user_access).delete().in('id', ids.slice(1));
  }
}
