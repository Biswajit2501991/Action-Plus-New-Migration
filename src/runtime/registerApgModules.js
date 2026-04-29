import * as permissions from '../features/access/permissions.js';

async function loadLeaveTrackerModule() {
  const url = new URL('../components/LeaveTrackerPageModule.jsx', import.meta.url);
  const res = await fetch(url.href, { cache: 'no-store' });
  if (!res.ok) throw new Error(`leave-tracker-load-${res.status}`);
  const source = await res.text();
  const compiled = window.Babel.transform(source, {
    presets: [['env', { modules: 'commonjs' }], 'react'],
  }).code;
  const module = { exports: {} };
  const req = (name) => {
    if (name === 'react') return window.React;
    throw new Error(`Unsupported runtime require: ${name}`);
  };
  const factory = new Function('module', 'exports', 'require', 'React', `${compiled}\nreturn module.exports;`);
  const out = factory(module, module.exports, req, window.React);
  return out.default || out;
}

async function register() {
  window.__APG_MODULES = window.__APG_MODULES || {};
  window.__APG_MODULES.permissions = permissions;
  window.__APG_MODULES.ALL_SECTIONS = permissions.ALL_SECTIONS;
  window.__APG_MODULES.DASHBOARD_CHILD_PERMISSIONS = permissions.DASHBOARD_CHILD_PERMISSIONS;
  window.__APG_MODULES.DEFAULT_ACCESS = permissions.DEFAULT_ACCESS;
  window.__APG_MODULES.normalizeAccess = permissions.normalizeAccess;
  window.__APG_MODULES.sectionsWithRoleDefaults = permissions.sectionsWithRoleDefaults;
  window.__APG_MODULES.LeaveTrackerPageModule = await loadLeaveTrackerModule();
}

register()
  .catch((err) => {
    console.error('APG module registration failed:', err);
  })
  .finally(() => {
    if (typeof window.__APG_RESOLVE_MODULES === 'function') window.__APG_RESOLVE_MODULES();
  });
