import { asUTC, MONTHS } from '../../lib/utils.js';

export function applyAdvancedMemberFilters(members, filters = {}) {
  const list = Array.isArray(members) ? members : [];
  return list.filter((m) => {
    if (filters.plan && m.plan !== filters.plan) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.paymentMethod && m.paymentMethod !== filters.paymentMethod) return false;
    if (filters.staff && m.staff !== filters.staff) return false;

    if (filters.billingMonth) {
      const dt = asUTC(m.billingDate);
      const billingMonth = dt ? `${MONTHS[dt.getUTCMonth()]}-${dt.getUTCFullYear()}` : '';
      if (billingMonth !== filters.billingMonth) return false;
    }

    if (filters.joinFrom) {
      const from = asUTC(filters.joinFrom);
      const value = asUTC(m.joiningDate);
      if (from && value && value < from) return false;
    }

    if (filters.joinTo) {
      const to = asUTC(filters.joinTo);
      const value = asUTC(m.joiningDate);
      if (to && value && value > to) return false;
    }

    if (filters.billFrom) {
      const from = asUTC(filters.billFrom);
      const value = asUTC(m.billingDate);
      if (from && value && value < from) return false;
    }

    if (filters.billTo) {
      const to = asUTC(filters.billTo);
      const value = asUTC(m.billingDate);
      if (to && value && value > to) return false;
    }
    return true;
  });
}

export function groupMembersByStatus(members) {
  const list = Array.isArray(members) ? members : [];
  return {
    Active: list.filter((m) => m.status === 'Active'),
    Hold: list.filter((m) => m.status === 'Hold'),
    Deactivated: list.filter((m) => m.status === 'Deactivated'),
    Cancelled: list.filter((m) => m.status === 'Cancelled'),
  };
}

export function paginate(list, page = 1, pageSize = 10) {
  const safe = Array.isArray(list) ? list : [];
  const totalPages = Math.max(1, Math.ceil(safe.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    totalPages,
    page: safePage,
    rows: safe.slice(start, start + pageSize),
  };
}

export function virtualSlice(list, visibleCount = 20) {
  const safe = Array.isArray(list) ? list : [];
  return {
    rows: safe.slice(0, visibleCount),
    hasMore: safe.length > visibleCount,
  };
}
