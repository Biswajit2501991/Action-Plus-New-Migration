import { T } from '../tables.js';

/** Cached: visitors.assigned_gym_code_id exists (migration supabase_visitors_gym_code.sql). */
let visitorsGymCodeColumn;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<boolean>}
 */
export async function visitorsHaveGymCodeColumn(sb) {
  if (visitorsGymCodeColumn !== undefined) return visitorsGymCodeColumn;
  const { error } = await sb.from(T.visitors).select('assigned_gym_code_id').limit(0);
  const missing = error && String(error.message || '').includes('assigned_gym_code_id');
  visitorsGymCodeColumn = !missing;
  if (missing) {
    console.warn(
      '[apg] visitors.assigned_gym_code_id missing — run backend/migrations/supabase_visitors_gym_code.sql in Supabase SQL Editor. Visitor sync omits branch column until then.',
    );
  }
  return visitorsGymCodeColumn;
}

/** @param {Record<string, unknown>} row */
export function stripVisitorGymCodeColumn(row) {
  if (!row || typeof row !== 'object') return row;
  const { assigned_gym_code_id, ...rest } = row;
  return rest;
}

export function resetVisitorsSchemaCacheForTests() {
  visitorsGymCodeColumn = undefined;
}
