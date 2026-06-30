/**
 * Canonical expense row builder — used by quick modal and Finance form.
 */

export function validateExpenseDraft(draft) {
  const amount = Number(draft?.amount || 0);
  if (!amount || amount <= 0) {
    return { ok: false, error: 'Please enter a valid expense amount.' };
  }
  if (!String(draft?.note || '').trim()) {
    return { ok: false, error: 'Expense note is required.' };
  }
  return { ok: true };
}

function newExpenseId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {object} draft date, amount, category, note, optional id/date
 * @param {{ actor?: string, userId?: string, userName?: string, appendAddedBy?: boolean }} [options]
 */
export function buildExpenseRow(draft, options = {}) {
  const actorLabel = String(
    options.actor || options.userName || options.userId || 'Staff',
  ).trim() || 'Staff';
  const noteBase = String(draft?.note || '').trim();
  const appendAddedBy = options.appendAddedBy !== false;
  const note = appendAddedBy && !/added by:/i.test(noteBase)
    ? [noteBase, `Added by: ${actorLabel}`].filter(Boolean).join(' • ')
    : noteBase;
  const category = String(draft?.category || 'General').trim() || 'General';
  const dateRaw = String(draft?.date || '').trim();
  const date = dateRaw.length >= 10 ? dateRaw.slice(0, 10) : dateRaw;

  return {
    id: draft?.id ? String(draft.id) : newExpenseId(),
    type: 'expense',
    source: 'manual',
    date: date || new Date().toISOString().slice(0, 10),
    amount: Number(draft?.amount || 0),
    category,
    note,
    status: 'posted',
    method: 'Cash',
    memberName: category,
    plan: 'Expense',
    addedBy: actorLabel,
    addedById: String(options.userId || '').trim(),
    createdAt: draft?.createdAt || new Date().toISOString(),
  };
}
