#!/usr/bin/env node
/**
 * One-time backfill: members with empty paymentHistory get rows from paymentReceivedAt or billingDate.
 *
 * Usage (from backend/):
 *   node scripts/backfill-member-payment-history.js --dry-run
 *   node scripts/backfill-member-payment-history.js
 *   node scripts/backfill-member-payment-history.js --limit=100
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

async function main() {
  const { applyPaymentHistoryBackfillToMember } = await import(
    '../../src/features/members/paymentHistoryLegacyBackfill.js'
  );
  const { readCollection, writeCollection } = await import('../src/db/supabase/repository.js');

  const members = await readCollection('apg.members', []);
  const list = Array.isArray(members) ? members : [];
  const slice = limit > 0 ? list.slice(0, limit) : list;

  let changedMembers = 0;
  let rowsAdded = 0;
  const patched = [];

  for (const m of slice) {
    const { member, changed, added } = applyPaymentHistoryBackfillToMember(m);
    if (changed) {
      changedMembers += 1;
      rowsAdded += added;
      patched.push(member);
    }
  }

  console.log(JSON.stringify({
    dryRun,
    totalMembers: list.length,
    scanned: slice.length,
    changedMembers,
    rowsAdded,
  }, null, 2));

  if (dryRun || !patched.length) return;

  const byId = new Map(list.map((m) => [String(m.memberId || ''), m]));
  for (const m of patched) {
    byId.set(String(m.memberId || ''), m);
  }
  await writeCollection('apg.members', [...byId.values()]);
  console.log('[backfill] writeCollection(apg.members) complete');
}

main().catch((err) => {
  console.error('[backfill] failed:', err?.message || err);
  process.exit(1);
});
