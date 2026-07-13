/**
 * Membership-by-plan distribution — ported from production `src/features/analytics/planDistribution.js`.
 */

const BUILTIN_PLAN_ALIASES: Record<string, string> = {
  basic: "Basic Plan",
  "basic plan": "Basic Plan",
  "basic membership": "Basic Plan",
  "pt-raja": "PT-Raja",
  "pt raja": "PT-Raja",
  "pt-kaushik": "PT-Kaushik",
  "pt kaushik": "PT-Kaushik",
};

const PIE_COLORS = ["#93c5fd", "#86efac", "#fde68a", "#fca5a5", "#c4b5fd", "#67e8f9"];

export function normalizePlanName(
  plan?: string | null,
  options: { aliases?: Record<string, string>; canonicalPlans?: string[]; emptyLabel?: string } = {},
): string {
  const raw = String(plan || "").trim();
  const emptyLabel = options.emptyLabel || "Unknown";
  if (!raw) return emptyLabel;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const merged = { ...BUILTIN_PLAN_ALIASES, ...(options.aliases || {}) };
  if (merged[key]) return merged[key];
  const plans = Array.isArray(options.canonicalPlans) ? options.canonicalPlans : [];
  const fromMaster = plans.find(
    (p) => String(p || "").trim().toLowerCase().replace(/\s+/g, " ") === key,
  );
  if (fromMaster) return String(fromMaster).trim();
  return raw;
}

export type PlanSlice = { name: string; count: number; pct: number; color: string };

export function buildMembershipPlanDistribution(
  members: { plan?: string | null; status?: string | null }[],
  options: {
    topN?: number;
    activeOnly?: boolean;
    canonicalPlans?: string[];
    aliases?: Record<string, string>;
  } = {},
): PlanSlice[] {
  const topN = Number(options.topN) > 0 ? Number(options.topN) : 6;
  const counts: Record<string, number> = {};
  for (const m of members || []) {
    if (!m) continue;
    if (options.activeOnly && String(m.status || "").trim() !== "Active") continue;
    const name = normalizePlanName(m.plan, options);
    counts[name] = (counts[name] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  return entries.slice(0, topN).map(([name, count], idx) => ({
    name,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }));
}

export function planDistributionConicGradient(segments: PlanSlice[]): string {
  if (!segments.length) return "#e2e8f0";
  let start = 0;
  const parts = segments.map((seg) => {
    const from = start;
    const to = start + seg.pct;
    start = to;
    return `${seg.color} ${from}% ${to}%`;
  });
  if (start < 100) parts.push(`#cbd5e1 ${start}% 100%`);
  return `conic-gradient(${parts.join(", ")})`;
}
