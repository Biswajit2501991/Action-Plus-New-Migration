import { gymId } from '../db/supabase/client.js';
import { readSettingsValue } from '../db/supabase/repository.js';
import { normalizeSettingsScope } from '../db/supabase/settingsScope.js';

/** @type {Map<string, Promise<object>>} */
const inFlight = new Map();

function cacheKey(scope, options = {}) {
  const gid = gymId();
  const settingsScope = normalizeSettingsScope(options.scope);
  const sandboxId = scope?.sandboxId ? String(scope.sandboxId) : '';
  return `${gid}:${sandboxId}:${settingsScope}`;
}

/**
 * Deduplicate concurrent settings reads for the same gym + scope.
 * Prevents request storms (hydrate + poll + tab switch) from stacking identical Supabase work.
 */
export async function readSettingsDeduped(scope = null, options = {}) {
  const key = cacheKey(scope, options);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const started = Date.now();
  const settingsScope = normalizeSettingsScope(options.scope);
  if (process.env.APG_DEBUG_SETTINGS === '1') {
    console.info('[settings-read] start', { key, scope: settingsScope });
  }

  const run = readSettingsValue(scope, { scope: settingsScope })
    .then((settings) => {
      if (process.env.APG_DEBUG_SETTINGS === '1') {
        console.info('[settings-read] ok', {
          key,
          scope: settingsScope,
          ms: Date.now() - started,
          keys: settings && typeof settings === 'object' ? Object.keys(settings).length : 0,
        });
      }
      return settings && typeof settings === 'object' ? settings : {};
    })
    .catch((error) => {
      if (process.env.APG_DEBUG_SETTINGS === '1') {
        console.error('[settings-read] fail', {
          key,
          scope: settingsScope,
          ms: Date.now() - started,
          message: String(error?.message || error),
        });
      }
      throw error;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, run);
  return run;
}

/** Test helper — clears in-flight dedupe map. */
export function resetSettingsReadDedupeForTests() {
  inFlight.clear();
}
