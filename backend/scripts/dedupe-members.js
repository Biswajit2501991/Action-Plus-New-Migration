/**
 * Remove duplicate members (same gym_id + member_code), keep newest updated_at.
 * Repoints child rows then deletes loser member ids.
 *
 * Usage: cd backend && node scripts/dedupe-members.js
 * Dry run: node scripts/dedupe-members.js --dry-run
 */
import dotenv from 'dotenv';
import { getSupabase, gymId } from '../src/db/supabase/client.js';
import { T } from '../src/db/tables.js';
import { fetchAll } from '../src/db/supabase/utils.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');

function pickKeeper(rows) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.updated_at || '') || 0;
    const tb = Date.parse(b.updated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return Number(b.id) - Number(a.id);
  })[0];
}

async function repointChildTable(sb, table, keepId, loseId, gymIdValue, opts = {}) {
  const { externalCol, conflictOnExternal = false } = opts;
  const { data: loseRows, error: readErr } = await sb
    .from(table)
    .select('id, gym_id, member_id' + (externalCol ? `, ${externalCol}` : ''))
    .eq('member_id', loseId);
  if (readErr) throw new Error(`${table} read: ${readErr.message}`);
  if (!loseRows?.length) return 0;

  let moved = 0;
  for (const row of loseRows) {
    if (conflictOnExternal && externalCol && row[externalCol] != null) {
      const { data: conflict } = await sb
        .from(table)
        .select('id')
        .eq('member_id', keepId)
        .eq('gym_id', gymIdValue)
        .eq(externalCol, row[externalCol])
        .maybeSingle();
      if (conflict?.id) {
        if (!dryRun) {
          const { error: delErr } = await sb.from(table).delete().eq('id', row.id);
          if (delErr) throw new Error(`${table} delete conflict: ${delErr.message}`);
        }
        continue;
      }
    }
    if (!dryRun) {
      const { error: updErr } = await sb.from(table).update({ member_id: keepId }).eq('id', row.id);
      if (updErr) throw new Error(`${table} repoint: ${updErr.message}`);
    }
    moved += 1;
  }
  return moved;
}

async function main() {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) =>
    sb.from(T.members).select('id, member_code, updated_at').eq('gym_id', gid).range(from, to),
  );

  const byCode = new Map();
  for (const row of rows) {
    const code = String(row.member_code || '');
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(row);
  }

  const pairs = [];
  for (const [code, list] of byCode) {
    if (list.length <= 1) continue;
    const keeper = pickKeeper(list);
    for (const row of list) {
      if (row.id !== keeper.id) pairs.push({ code, keepId: keeper.id, loseId: row.id });
    }
  }

  console.log(`Members scanned: ${rows.length}`);
  console.log(`Duplicate codes: ${pairs.length} loser row(s) to remove${dryRun ? ' (dry run)' : ''}`);

  if (!pairs.length) {
    console.log('Nothing to dedupe.');
    return;
  }

  let deleted = 0;
  for (const { code, keepId, loseId } of pairs) {
    await repointChildTable(sb, T.member_payment_history, keepId, loseId, gid, {
      externalCol: 'external_payment_id',
      conflictOnExternal: true,
    });
    await repointChildTable(sb, T.member_message_history, keepId, loseId, gid, {
      externalCol: 'external_event_id',
      conflictOnExternal: true,
    });
    await repointChildTable(sb, T.member_injury_notes, keepId, loseId, gid, {
      externalCol: 'external_note_id',
      conflictOnExternal: true,
    });
    await repointChildTable(sb, T.member_attachments, keepId, loseId, gid);

    const { data: losePt } = await sb
      .from(T.pt_client_profiles)
      .select('id, gym_id')
      .eq('member_id', loseId)
      .maybeSingle();
    if (losePt?.id) {
      const { data: keepPt } = await sb
        .from(T.pt_client_profiles)
        .select('id')
        .eq('member_id', keepId)
        .eq('gym_id', gid)
        .maybeSingle();
      if (keepPt?.id) {
        if (!dryRun) {
          const { error } = await sb.from(T.pt_client_profiles).delete().eq('id', losePt.id);
          if (error) throw new Error(`pt delete: ${error.message}`);
        }
      } else if (!dryRun) {
        const { error } = await sb.from(T.pt_client_profiles).update({ member_id: keepId }).eq('id', losePt.id);
        if (error) throw new Error(`pt repoint: ${error.message}`);
      }
    }

    if (!dryRun) {
      const { error } = await sb.from(T.members).delete().eq('id', loseId);
      if (error) throw new Error(`member delete ${code} id=${loseId}: ${error.message}`);
    }
    deleted += 1;
    if (deleted % 50 === 0) console.log(`  processed ${deleted}/${pairs.length}...`);
  }

  console.log(dryRun ? `Would delete ${deleted} duplicate member rows.` : `Deleted ${deleted} duplicate member rows.`);
  console.log('Next: run supabase_members_dedupe_unique.sql in SQL Editor to add UNIQUE (gym_id, member_code).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
