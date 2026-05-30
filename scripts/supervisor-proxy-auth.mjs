import http from 'node:http';

/**
 * V-003: supervisor restart/stop/start must not be callable anonymously from the public internet.
 * The frontend proxy injects PROCESS_CONTROL_TOKEN server-side — gate mutations on master-owner session.
 */

export function isMasterOwnerAuthPayload(data) {
  if (!data || typeof data !== 'object') return false;
  const user = data.user;
  const id = String(user?.id || data.userId || '').trim().toLowerCase();
  const role = String(user?.staffRole || data.staffRole || '').trim().toLowerCase();
  if (id === 'owner') return true;
  if (role === 'master_owner') return true;
  return Array.isArray(data.roles) && data.roles.includes('owner');
}

export function isSupervisorMutationPath(urlPath) {
  const sub = String(urlPath || '')
    .replace(/^\/__apg_supervisor/i, '')
    .replace(/\/$/, '');
  return /^\/backend\/(start|stop|restart)$/i.test(sub);
}

/**
 * @param {import('http').IncomingMessage} clientReq
 * @param {{ backendHost?: string, backendPort?: number }} [opts]
 */
export function verifySupervisorProxyOwner(clientReq, opts = {}) {
  const backendHost = opts.backendHost || '127.0.0.1';
  const backendPort = Number(opts.backendPort || 4000);
  const outHeaders = { Accept: 'application/json' };
  for (const [k, v] of Object.entries(clientReq.headers || {})) {
    if (!v) continue;
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie') {
      outHeaders[k] = v;
    }
  }
  if (!outHeaders.Authorization && !outHeaders.Cookie && !outHeaders.cookie) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: '/api/auth/me',
        method: 'GET',
        headers: outHeaders,
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            resolve(isMasterOwnerAuthPayload(JSON.parse(body)));
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
