/**
 * Merge audit log arrays by id (newest first). Remote/incoming rows win on id collision.
 * @param {object[]} prev
 * @param {object[]} incoming
 * @param {number} [limit=5000]
 */
export function mergeAuditLogs(prev, incoming, limit = 5000) {
  const byId = new Map();
  for (const l of (Array.isArray(prev) ? prev : [])) {
    const id = String(l?.id || '').trim();
    if (id) byId.set(id, l);
  }
  for (const l of (Array.isArray(incoming) ? incoming : [])) {
    const id = String(l?.id || '').trim();
    if (id) byId.set(id, l);
  }
  return [...byId.values()]
    .sort((a, b) => {
      const ta = Date.parse(String(a?.ts || '')) || 0;
      const tb = Date.parse(String(b?.ts || '')) || 0;
      return tb - ta;
    })
    .slice(0, Math.max(Number(limit) || 5000, 1));
}
