/**
 * Membership-by-plan distribution (Dashboard + Finance Plan Popularity).
 */

const BUILTIN_PLAN_ALIASES = {
  basic: 'Basic Plan',
  'basic plan': 'Basic Plan',
  'basic membership': 'Basic Plan',
  'pt-raja': 'PT-Raja',
  'pt raja': 'PT-Raja',
  'pt-kaushik': 'PT-Kaushik',
  'pt kaushik': 'PT-Kaushik',
};

/**
 * @param {string} plan
 * @param {object} [options]
 * @param {Record<string, string>} [options.aliases] lowercase key → display name
 * @param {string[]} [options.canonicalPlans] master plan list from settings
 * @param {string} [options.emptyLabel]
 */
export function normalizePlanName(plan, options = {}) {
  const raw = String(plan || '').trim();
  const emptyLabel = options.emptyLabel || 'Unknown';
  if (!raw) return emptyLabel;

  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  const custom = options.aliases && typeof options.aliases === 'object' ? options.aliases : {};
  const merged = { ...BUILTIN_PLAN_ALIASES, ...custom };
  if (merged[key]) return merged[key];

  const plans = Array.isArray(options.canonicalPlans) ? options.canonicalPlans : [];
  const fromMaster = plans.find((p) => String(p || '').trim().toLowerCase().replace(/\s+/g, ' ') === key);
  if (fromMaster) return String(fromMaster).trim();

  return raw;
}

const PIE_COLORS = ['#93c5fd', '#86efac', '#fde68a', '#fca5a5', '#c4b5fd', '#67e8f9'];
const PIE_COLORS_FINANCE = ['#2563eb', '#16a34a', '#eab308', '#7c3aed', '#f97316', '#06b6d4'];

/**
 * @param {object[]} members
 * @param {object} [options]
 * @param {number} [options.topN=6]
 * @param {boolean} [options.activeOnly=false]
 * @param {string[]} [options.canonicalPlans]
 * @param {Record<string, string>} [options.aliases]
 * @param {'dashboard'|'finance'} [options.palette]
 * @returns {{ name: string, count: number, pct: number, color: string }[]}
 */
export function buildMembershipPlanDistribution(members, options = {}) {
  const topN = Number(options.topN) > 0 ? Number(options.topN) : 6;
  const activeOnly = Boolean(options.activeOnly);
  const palette = options.palette === 'finance' ? PIE_COLORS_FINANCE : PIE_COLORS;
  const normOpts = {
    canonicalPlans: options.canonicalPlans,
    aliases: options.aliases,
    emptyLabel: options.emptyLabel || 'Unknown',
  };

  const counts = {};
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || typeof m !== 'object') continue;
    if (activeOnly && String(m.status || '').trim() !== 'Active') continue;
    const name = normalizePlanName(m.plan, normOpts);
    counts[name] = (counts[name] || 0) + 1;
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  return entries.slice(0, topN).map(([name, count], idx) => ({
    name,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
    color: palette[idx % palette.length],
  }));
}

/** @param {{ pct: number, color: string }[]} segments */
export function planDistributionConicGradient(segments) {
  if (!segments.length) return '#e2e8f0';
  let start = 0;
  const parts = segments.map((seg) => {
    const from = start;
    const to = start + seg.pct;
    start = to;
    return `${seg.color} ${from}% ${to}%`;
  });
  if (start < 100) parts.push(`#cbd5e1 ${start}% 100%`);
  return `conic-gradient(${parts.join(', ')})`;
}
