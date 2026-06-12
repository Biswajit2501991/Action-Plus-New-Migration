import { toTs } from './utils.js';

const BILLING_DB_FIELDS = [
  'billing_date',
  'billing_date_updated_at',
  'next_payment_date',
  'payment_by',
];

function billingUpdatedAtMs(row) {
  const ts = toTs(row?.billing_date_updated_at);
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Bulk PUT can finish after a surgical PATCH with a stale snapshot. Keep DB billing
 * cycle fields when the row already has a newer billing_date_updated_at.
 */
export function preserveNewerBillingOnBulkRow(incomingRow, existingRow) {
  if (!incomingRow || !existingRow) return incomingRow;
  const inMs = billingUpdatedAtMs(incomingRow);
  const exMs = billingUpdatedAtMs(existingRow);
  if (!exMs || inMs >= exMs) return incomingRow;
  const row = { ...incomingRow };
  for (const key of BILLING_DB_FIELDS) {
    if (existingRow[key] != null && existingRow[key] !== '') {
      row[key] = existingRow[key];
    }
  }
  return row;
}
