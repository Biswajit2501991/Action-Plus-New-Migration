/** PostgREST / Supabase max rows per request. */
export const AUDIT_LOGS_PAGE_SIZE = 1000;

/** Max audit rows to load into the Audit Command Center list view. */
export const AUDIT_LOGS_LIST_LIMIT = 25000;

export const DEFAULT_AUDIT_LOGS_QUERY = `view=list&days=2555&limit=${AUDIT_LOGS_LIST_LIMIT}`;

/**
 * @param {string} baseQuery
 * @returns {number}
 */
export function parseAuditLogsRequestedLimit(baseQuery) {
  const q = String(baseQuery || DEFAULT_AUDIT_LOGS_QUERY);
  const match = /(?:^|&)limit=(\d+)/i.exec(q);
  const parsed = match ? Number(match[1]) : AUDIT_LOGS_LIST_LIMIT;
  if (!Number.isFinite(parsed) || parsed < 1) return AUDIT_LOGS_LIST_LIMIT;
  return Math.min(parsed, 50000);
}

/**
 * Audit log loading — isolated from member sync/delete so log changes cannot affect members.
 * @param {(path: string, init?: object) => Promise<unknown>} backendJson
 * @param {string} [baseQuery]
 */
export async function fetchAuditLogsFromBackend(backendJson, baseQuery) {
  const query = String(baseQuery || DEFAULT_AUDIT_LOGS_QUERY);
  const pageSize = AUDIT_LOGS_PAGE_SIZE;
  const requestedLimit = parseAuditLogsRequestedLimit(query);
  const maxPages = Math.ceil(requestedLimit / pageSize) + 1;
  let offset = 0;
  const all = [];
  for (let page = 0; page < maxPages && all.length < requestedLimit; page += 1) {
    const batch = await backendJson(`/logs?${query}&offset=${offset}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (all.length >= requestedLimit) break;
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return all.length > requestedLimit ? all.slice(0, requestedLimit) : all;
}
