// Default env for static hosts (VS Code Live Server, etc.).
// `npm run dev:web` serves a dynamic version with API proxy at the same path.
window.__APG_ENV__ = window.__APG_ENV__ || {
  FRONTEND_PORT: 5500,
  BACKEND_PORT: 4000,
  API_BASE_URL: '/api',
  SUPERVISOR_RELATIVE: '/__apg_supervisor',
  V2_BASE_PATH: '/v2/',
};
