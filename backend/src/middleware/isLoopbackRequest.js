/**
 * True when the TCP peer is localhost (V-003 process-control hardening).
 */
export function isLoopbackRequest(req) {
  const addr = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '');
  if (
    addr === '127.0.0.1'
    || addr === '::1'
    || addr === '::ffff:127.0.0.1'
    || addr.endsWith('127.0.0.1')
  ) {
    return true;
  }
  return false;
}
