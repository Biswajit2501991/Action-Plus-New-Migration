import * as permissions from '../features/access/permissions.js';

function emitTelemetry(level, code, message, meta = {}) {
  const payload = {
    level,
    code,
    message,
    meta,
    ts: new Date().toISOString(),
  };
  window.__APG_MODULE_TELEMETRY = window.__APG_MODULE_TELEMETRY || [];
  window.__APG_MODULE_TELEMETRY.unshift(payload);
  window.__APG_MODULE_TELEMETRY = window.__APG_MODULE_TELEMETRY.slice(0, 100);
  window.dispatchEvent(new CustomEvent('apg:module-loader', { detail: payload }));
}

async function precheckLeaveTrackerModule() {
  const url = new URL('../components/LeaveTrackerPageModule.jsx', import.meta.url);
  if (url.origin !== window.location.origin) throw new Error('precheck-cross-origin-blocked');
  if (!window.React) throw new Error('precheck-react-missing');
  if (!window.Babel) throw new Error('precheck-babel-missing');
  const res = await fetch(url.href, { cache: 'no-store' });
  if (!res.ok) throw new Error(`precheck-http-${res.status}`);
  const text = await res.text();
  if (!text.includes('export default')) throw new Error('precheck-invalid-module-shape');
  return { url: url.href, source: text };
}

async function loadLeaveTrackerModuleFromSource(source) {
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

async function loadLeaveTrackerModuleWithRetry(maxAttempts = 3) {
  const { source } = await precheckLeaveTrackerModule();
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) emitTelemetry('warn', 'retry', `Retrying Leave Tracker module load (${attempt}/${maxAttempts})`, { attempt, maxAttempts });
      return await loadLeaveTrackerModuleFromSource(source);
    } catch (err) {
      lastErr = err;
      emitTelemetry('warn', 'load-attempt-failed', `Leave Tracker module load attempt ${attempt} failed`, { attempt, error: String(err?.message || err) });
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastErr || new Error('leave-tracker-load-failed');
}

async function register() {
  emitTelemetry('info', 'init', 'Module registration started');
  window.__APG_MODULES = window.__APG_MODULES || {};
  window.__APG_MODULES.permissions = permissions;
  window.__APG_MODULES.ALL_SECTIONS = permissions.ALL_SECTIONS;
  window.__APG_MODULES.DASHBOARD_CHILD_PERMISSIONS = permissions.DASHBOARD_CHILD_PERMISSIONS;
  window.__APG_MODULES.DEFAULT_ACCESS = permissions.DEFAULT_ACCESS;
  window.__APG_MODULES.normalizeAccess = permissions.normalizeAccess;
  window.__APG_MODULES.sectionsWithRoleDefaults = permissions.sectionsWithRoleDefaults;
  window.__APG_MODULES.LeaveTrackerPageModule = await loadLeaveTrackerModuleWithRetry(3);
  emitTelemetry('info', 'ready', 'Module registration completed');
}

register()
  .catch((err) => {
    emitTelemetry('error', 'fatal', 'APG module registration failed. Fallback mode enabled.', { error: String(err?.message || err) });
    console.error('APG module registration failed:', err);
  })
  .finally(() => {
    if (typeof window.__APG_RESOLVE_MODULES === 'function') window.__APG_RESOLVE_MODULES();
  });
