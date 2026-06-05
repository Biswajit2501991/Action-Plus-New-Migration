#!/usr/bin/env node
/**
 * Backfill members.pay_month from member_paid_for_month ledger when membership column is empty.
 * Uses the most recently updated ledger row per member. Never overwrites non-empty pay_month.
 *
 * Usage (from repo root):
 *   node backend/scripts/backfill-members-pay-month.js --dry-run
 *   node backend/scripts/backfill-members-pay-month.js
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { getSupabase, gymId } = await import('../src/db/supabase/client.js');
  const { T } = await import('../src/db/tables.js');
  const sb = getSupabase();
  const gid = gymId();

  const { data: members, error: memErr } = await sb
    .from(T.members)
    .select('id, member_code, pay_month')
    .eq('gym_id', gid);
  if (memErr) throw memErr;

  const emptyMembers = (members || []).filter((m) => !String(m.pay_month || '').trim());
  if (!emptyMembers.length) {
    console.log(JSON.stringify({ dryRun, emptyMembers: 0, backfilled: 0, samples: [] }));
    return;
  }

  const memberIds = emptyMembers.map((m) => m.id);
  const { data: ledgerRows, error: ledErr } = await sb
    .from(T.member_paid_for_month)
    .select('member_id, member_code, paid_for_month, updated_at')
    .eq('gym_id', gid)
    .in('member_id', memberIds)
    .order('updated_at', { ascending: false });
  if (ledErr) throw ledErr;

  const latestByMember = new Map();
  for (const row of ledgerRows || []) {
    const pk = row.member_id;
    if (pk == null || latestByMember.has(pk)) continue;
    const key = String(row.paid_for_month || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) continue;
    latestByMember.set(pk, key);
  }

  let backfilled = 0;
  const samples = [];
  for (const m of emptyMembers) {
    const payMonth = latestByMember.get(m.id);
    if (!payMonth) continue;
    if (samples.length < 10) {
      samples.push({ memberCode: m.member_code, payMonth });
    }
    if (dryRun) {
      backfilled += 1;
      continue;
    }
    const { error: upErr } = await sb
      .from(T.members)
      .update({ pay_month: payMonth, updated_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('gym_id', gid);
    if (upErr) throw upErr;
    backfilled += 1;
  }

  console.log(JSON.stringify({
    dryRun,
    emptyMembers: emptyMembers.length,
    ledgerCandidates: latestByMember.size,
    backfilled,
    samples,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
