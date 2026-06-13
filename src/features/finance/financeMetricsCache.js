/**
 * In-memory finance metrics cache (Hybrid D).
 * Survives Dashboard ↔ Finance tab navigation; invalidated only by payment/finance events.
 */

const monthCache = new Map();
const yearCache = new Map();

const SESSION_PREFIX = 'apg.financeMetrics.v1';
const BC_CHANNEL = 'apg-finance-metrics';

let broadcastChannel = null;

function branchKey(branchId) {
  return String(branchId || 'default').trim() || 'default';
}

function monthCacheKey(branchId, monthKey) {
  return `${branchKey(branchId)}:${String(monthKey || '').trim()}`;
}

function yearCacheKey(branchId, year) {
  return `${branchKey(branchId)}:${String(year || '').trim()}`;
}

function sessionMonthKey(branchId, monthKey) {
  return `${SESSION_PREFIX}:m:${monthCacheKey(branchId, monthKey)}`;
}

function sessionYearKey(branchId, year) {
  return `${SESSION_PREFIX}:y:${yearCacheKey(branchId, year)}`;
}

function readSessionJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function removeSessionByPrefix(prefix) {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function getBroadcastChannel() {
  if (broadcastChannel) return broadcastChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    broadcastChannel = new BroadcastChannel(BC_CHANNEL);
  } catch {
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function postInvalidation(detail) {
  const bc = getBroadcastChannel();
  if (!bc) return;
  try {
    bc.postMessage({ type: 'invalidate', detail: detail || {} });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} branchId
 * @param {string} monthKey YYYY-MM
 */
export function getCachedFinanceMonthSummary(branchId, monthKey) {
  const key = monthCacheKey(branchId, monthKey);
  const hit = monthCache.get(key);
  if (hit?.data) return hit.data;
  const session = readSessionJson(sessionMonthKey(branchId, monthKey));
  if (session?.data) {
    monthCache.set(key, { data: session.data, fetchedAt: session.fetchedAt || Date.now() });
    return session.data;
  }
  return null;
}

/**
 * @param {string} branchId
 * @param {number|string} year
 */
export function getCachedFinanceYearSummary(branchId, year) {
  const key = yearCacheKey(branchId, year);
  const hit = yearCache.get(key);
  if (hit?.data) return hit.data;
  const session = readSessionJson(sessionYearKey(branchId, year));
  if (session?.data) {
    yearCache.set(key, { data: session.data, fetchedAt: session.fetchedAt || Date.now() });
    return session.data;
  }
  return null;
}

export function setCachedFinanceMonthSummary(branchId, monthKey, data) {
  const key = monthCacheKey(branchId, monthKey);
  const entry = { data, fetchedAt: Date.now() };
  monthCache.set(key, entry);
  writeSessionJson(sessionMonthKey(branchId, monthKey), entry);
}

export function setCachedFinanceYearSummary(branchId, year, data) {
  const key = yearCacheKey(branchId, year);
  const entry = { data, fetchedAt: Date.now() };
  yearCache.set(key, entry);
  writeSessionJson(sessionYearKey(branchId, year), entry);
}

/**
 * @param {{
 *   branchId?: string,
 *   months?: string[],
 *   years?: (number|string)[],
 *   all?: boolean,
 *   reason?: string,
 *   broadcast?: boolean,
 * }} [options]
 */
export function invalidateFinanceMetrics(options = {}) {
  const branchId = branchKey(options.branchId);
  const broadcast = options.broadcast !== false;

  if (options.all) {
    for (const k of [...monthCache.keys()]) {
      if (k.startsWith(`${branchId}:`)) monthCache.delete(k);
    }
    for (const k of [...yearCache.keys()]) {
      if (k.startsWith(`${branchId}:`)) yearCache.delete(k);
    }
    removeSessionByPrefix(`${SESSION_PREFIX}:m:${branchId}:`);
    removeSessionByPrefix(`${SESSION_PREFIX}:y:${branchId}:`);
  } else {
    const months = Array.isArray(options.months) ? options.months : [];
    const years = Array.isArray(options.years) ? options.years : [];
    for (const monthKey of months) {
      const mk = String(monthKey || '').trim();
      if (!mk) continue;
      monthCache.delete(monthCacheKey(branchId, mk));
      try { sessionStorage.removeItem(sessionMonthKey(branchId, mk)); } catch { /* ignore */ }
      const y = mk.slice(0, 4);
      if (y) {
        yearCache.delete(yearCacheKey(branchId, y));
        try { sessionStorage.removeItem(sessionYearKey(branchId, y)); } catch { /* ignore */ }
      }
    }
    for (const year of years) {
      const y = String(year || '').trim();
      if (!y) continue;
      yearCache.delete(yearCacheKey(branchId, y));
      try { sessionStorage.removeItem(sessionYearKey(branchId, y)); } catch { /* ignore */ }
    }
  }

  if (broadcast) {
    postInvalidation({ ...options, branchId, broadcast: false });
  }
}

/** Clear all branches (logout) or one branch (branch switch). */
export function clearFinanceMetricsCache(branchId) {
  if (branchId) {
    invalidateFinanceMetrics({ branchId, all: true, broadcast: true, reason: 'branch-clear' });
    return;
  }
  monthCache.clear();
  yearCache.clear();
  removeSessionByPrefix(SESSION_PREFIX);
  postInvalidation({ all: true, broadcast: false, reason: 'global-clear' });
}

/**
 * Dispatch invalidation + optional epoch bump in React layer.
 * @param {object} [detail]
 */
export function dispatchFinanceMetricsInvalidate(detail = {}) {
  if (typeof window === 'undefined') return;
  invalidateFinanceMetrics({ ...detail, broadcast: true });
  window.dispatchEvent(new CustomEvent('apg-finance-invalidate', { detail }));
}

/**
 * Subscribe to cross-tab invalidation. Returns unsubscribe.
 * @param {(detail: object) => void} handler
 */
export function subscribeFinanceMetricsInvalidation(handler) {
  const bc = getBroadcastChannel();
  const onMessage = (ev) => {
    const detail = ev?.data?.detail || {};
    if (ev?.data?.type !== 'invalidate') return;
    invalidateFinanceMetrics({ ...detail, broadcast: false });
    if (typeof handler === 'function') handler(detail);
  };
  if (bc) bc.addEventListener('message', onMessage);
  return () => {
    if (bc) bc.removeEventListener('message', onMessage);
  };
}
