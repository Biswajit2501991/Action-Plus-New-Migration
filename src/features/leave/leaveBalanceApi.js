/**
 * @param {(path: string, init?: object) => Promise<any>} backendJson
 * @param {{ year?: number }} [options]
 */
export async function fetchLeaveBalances(backendJson, options = {}) {
  const year = Number(options.year) || new Date().getFullYear();
  const res = await backendJson(`/leave-balance?year=${encodeURIComponent(String(year))}`);
  return {
    calendarYear: Number(res?.calendarYear) || year,
    baseDays: Number(res?.baseDays) || 24,
    adjustments: Array.isArray(res?.adjustments) ? res.adjustments : [],
    rows: Array.isArray(res?.rows) ? res.rows : [],
  };
}

export async function previewLeaveBalanceAdjustment(backendJson, adjustmentDays, calendarYear) {
  return backendJson('/leave-balance/preview', {
    method: 'POST',
    body: JSON.stringify({
      adjustmentDays: Number(adjustmentDays),
      calendarYear: Number(calendarYear) || new Date().getFullYear(),
    }),
  });
}

export async function applyLeaveBalanceAdjustment(backendJson, adjustmentDays, calendarYear, reason = '') {
  return backendJson('/leave-balance/adjust', {
    method: 'POST',
    body: JSON.stringify({
      adjustmentDays: Number(adjustmentDays),
      calendarYear: Number(calendarYear) || new Date().getFullYear(),
      reason: String(reason || '').trim() || undefined,
    }),
  });
}
