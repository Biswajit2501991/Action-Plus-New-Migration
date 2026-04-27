export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function asUTC(val) {
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d, n) {
  const base = asUTC(d);
  if (!base) return null;
  base.setUTCDate(base.getUTCDate() + (Number(n) || 0));
  return base;
}

export function addMonths(d, n) {
  const base = asUTC(d);
  if (!base) return null;
  base.setUTCMonth(base.getUTCMonth() + (Number(n) || 0));
  return base;
}

export function billingMonthLabel(date) {
  const dt = asUTC(date);
  if (!dt) return '';
  return `${MONTHS[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
}

export function applyMemberFilters(list, filters = {}) {
  const safeList = Array.isArray(list) ? list : [];
  return safeList.filter((m) => {
    if (filters.plan && m.plan !== filters.plan) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.paymentMethod && m.paymentMethod !== filters.paymentMethod) return false;
    if (filters.staff && m.staff !== filters.staff) return false;
    if (filters.billingMonth && billingMonthLabel(m.billingDate) !== filters.billingMonth) return false;
    return true;
  });
}

export function sanitizeForLog(obj) {
  if (!obj) return null;
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (key === 'password') return '[redacted]';
      if (key === 'photo') return value ? '[image]' : null;
      if (typeof value === 'string' && value.length > 300) return value.slice(0, 300) + '...';
      return value;
    }));
  } catch {
    return null;
  }
}
