const DEFAULT_BASE_URL = 'http://localhost:4000/api';

function createLocalApiClient() {
  return {
    async health() {
      return { ok: true, mode: 'local' };
    },
    async listMembers() {
      return JSON.parse(localStorage.getItem('apg.members') || '[]');
    },
    async saveMembers(members) {
      localStorage.setItem('apg.members', JSON.stringify(members || []));
      return { ok: true };
    },
    async listUsers() {
      return JSON.parse(localStorage.getItem('apg.users') || '[]');
    },
    async saveUsers(users) {
      localStorage.setItem('apg.users', JSON.stringify(users || []));
      return { ok: true };
    },
  };
}

function createHttpApiClient(baseUrl = DEFAULT_BASE_URL) {
  const json = async (path, init = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      ...init,
    });
    if (!res.ok) throw new Error(`api-${res.status}`);
    return res.json();
  };
  return {
    async health() {
      return json('/health');
    },
    async listMembers() {
      return json('/members');
    },
    async saveMembers(members) {
      return json('/members/bulk', { method: 'PUT', body: JSON.stringify({ members }) });
    },
    async listUsers() {
      return json('/users');
    },
    async saveUsers(users) {
      return json('/users/bulk', { method: 'PUT', body: JSON.stringify({ users }) });
    },
  };
}

export function createApiClient(mode = 'local', options = {}) {
  if (mode === 'http') return createHttpApiClient(options.baseUrl);
  return createLocalApiClient();
}
