/**
 * Audit log loading — isolated from member sync/delete so log changes cannot affect members.
 * @param {(path: string, init?: object) => Promise<unknown>} backendJson
 */
export async function fetchAuditLogsFromBackend(backendJson, baseQuery) {
  const query = String(baseQuery || 'view=list&days=2555&limit=5000');
  const pageSize = 5000;
  let offset = 0;
  const all = [];
  for (let page = 0; page < 20; page += 1) {
    const batch = await backendJson(`/logs?${query}&offset=${offset}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return all;
}

export const DEFAULT_AUDIT_LOGS_QUERY = 'view=list&days=2555&limit=5000';
