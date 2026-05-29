/**
 * Structured authorization denial logging (investigation + production diagnostics).
 */
export function logAuthorizationDenial(req, detail = {}) {
  const auth = req?.auth || {};
  const payload = {
    ts: new Date().toISOString(),
    path: req?.path || req?.originalUrl || '',
    method: req?.method || '',
    userId: auth.userId || null,
    staffRole: auth.staffRole || null,
    roles: auth.roles || [],
    error: detail.error || 'forbidden',
    reason: detail.reason || '',
    roleSource: detail.roleSource || null,
  };
  // eslint-disable-next-line no-console
  console.warn('[auth-deny]', JSON.stringify(payload));
  return payload;
}
