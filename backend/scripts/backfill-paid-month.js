#!/usr/bin/env node
/**
 * Backfill member_payment_history.paid_month from billing_date / billing_month / paid_at.
 * Never overwrites rows that already have paid_month set.
 *
 * Usage (from repo root):
 *   node backend/scripts/backfill-paid-month.js --dry-run
 *   node backend/scripts/backfill-paid-month.js
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

  const { data: rows, error } = await sb
    .from(T.member_payment_history)
    .select('id, paid_month, billing_date, billing_month, paid_at')
    .eq('gym_id', gid);
  if (error) throw error;

  const candidates = (rows || []).filter((r) => !String(r.paid_month || '').trim());
  let updated = 0;
  const samples = [];

  for (const row of candidates) {
    const billingDate = row.billing_date ? String(row.billing_date).slice(0, 10) : '';
    const billingMonth = String(row.billing_month || '').trim();
    const paidAt = row.paid_at ? String(row.paid_at) : '';
    let paidMonth = '';
    let confidence = 'low';

    if (billingDate && /^\d{4}-\d{2}/.test(billingDate)) {
      paidMonth = billingDate.slice(0, 7);
      confidence = 'high';
    } else if (/^\d{4}-\d{2}$/.test(billingMonth)) {
      paidMonth = billingMonth;
      confidence = 'medium';
    } else if (paidAt) {
      paidMonth = paidAt.slice(0, 7);
      confidence = 'low';
    }
    if (!paidMonth) continue;

    if (samples.length < 5) {
      samples.push({ id: row.id, paidMonth, confidence, billingDate, billingMonth });
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    const { error: upErr } = await sb
      .from(T.member_payment_history)
      .update({ paid_month: paidMonth })
      .eq('id', row.id)
      .or('paid_month.is.null,paid_month.eq.');
    if (upErr) throw upErr;
    updated += 1;
  }

  console.log(JSON.stringify({
    dryRun,
    totalRows: (rows || []).length,
    missingPaidMonth: candidates.length,
    backfilled: updated,
    confidenceNotes: {
      high: 'billing_date present — cycle month from billing date before payment',
      medium: 'billing_month only — may differ from true cycle if data entry used payment date',
      low: 'paid_at month only — collection month, not service month; review late payments',
    },
    samples,
  }, null, 2));
}

main().catch((err) => {
  console.error('[backfill-paid-month] failed:', err?.message || err);
  process.exit(1);
});
