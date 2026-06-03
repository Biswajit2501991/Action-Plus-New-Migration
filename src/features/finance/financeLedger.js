/**
 * Finance ledger rows — income from member payments (transaction date) plus billing pending + manual rows.
 */

/**
 * @param {object[]} members
 * @param {(member: object) => object[]} normalizeMemberPaymentHistory
 * @param {(value: unknown) => string} calendarDateKey YYYY-MM-DD
 */
export function buildPaymentIncomeLedgerRows(members, normalizeMemberPaymentHistory, calendarDateKey) {
  const toDay = typeof calendarDateKey === 'function'
    ? calendarDateKey
    : (v) => String(v || '').slice(0, 10);
  const rows = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || typeof m !== 'object') continue;
    const memberId = String(m.memberId || '').trim();
    const history = typeof normalizeMemberPaymentHistory === 'function'
      ? normalizeMemberPaymentHistory(m)
      : [];
    for (const h of history) {
      const day = toDay(h.paidAt || h.receivedAt || h.date || h.ts || '');
      const amount = Number(h.amount || 0);
      if (!day || amount <= 0) continue;
      rows.push({
        id: `pay-${memberId}-${String(h.id || day)}`,
        type: 'income',
        source: 'payment',
        memberId,
        memberName: m.name || '',
        date: day,
        plan: m.plan || '',
        method: String(h.method || m.paymentMethod || '').trim(),
        amount,
        status: 'paid',
        memberStatus: m.status || '',
        note: String(h.note || '').trim(),
      });
    }
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Overdue billing placeholders (not counted in collected revenue).
 * @param {object[]} members
 * @param {{ retentionPaymentDeadline: (m: object) => Date|null, calendarDateKey: (v: unknown) => string, today?: Date }} deps
 */
export function buildBillingPendingLedgerRows(members, deps) {
  const {
    retentionPaymentDeadline,
    calendarDateKey,
    today = new Date(),
  } = deps;
  const toDay = typeof calendarDateKey === 'function'
    ? calendarDateKey
    : (v) => String(v || '').slice(0, 10);
  const rows = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || m.status !== 'Active' || !m.billingDate) continue;
    const due = typeof retentionPaymentDeadline === 'function'
      ? retentionPaymentDeadline(m)
      : null;
    if (!due || due >= today) continue;
    const day = toDay(m.billingDate) || String(m.billingDate || '').slice(0, 10);
    if (!day) continue;
    rows.push({
      id: `pending-${String(m.memberId || 'member')}-${day}`,
      type: 'income',
      source: 'billing-pending',
      memberId: m.memberId || '',
      memberName: m.name || '',
      date: day,
      plan: m.plan || '',
      method: m.paymentMethod || '',
      amount: Number(m.amount || 0),
      status: 'pending',
      memberStatus: m.status || '',
    });
  }
  return rows;
}

/**
 * @param {object[]} financeTransactions raw store rows
 */
export function mapManualFinanceLedgerRows(financeTransactions) {
  return (Array.isArray(financeTransactions) ? financeTransactions : []).map((t) => ({
    id: t.id || `manual-${String(t.date || '')}`,
    type: t.type === 'expense' ? 'expense' : 'income',
    source: t.source || 'manual',
    memberId: t.memberId || '',
    memberName: t.memberName || (t.type === 'expense' ? (t.category || 'Expense') : ''),
    date: String(t.date || '').slice(0, 10),
    plan: t.plan || (t.type === 'expense' ? 'Expense' : ''),
    method: t.method || 'Cash',
    amount: Number(t.amount || 0),
    status: t.status || (t.type === 'expense' ? 'posted' : 'paid'),
    memberStatus: t.memberStatus || '',
    note: t.note || '',
    category: t.category || '',
  }));
}
