import { authIsMasterOwnerUser } from '../tenant/branchOwnerAccess.js';

/** Gym-wide feature flag — persisted in settings_app_config.config_json. */
export const CUSTOM_TEMPLATES_FEATURE_FLAG_KEY = 'customTemplatesEnabled';

/**
 * Custom WhatsApp Templates are disabled unless explicitly enabled per gym.
 * @param {Record<string, unknown>|null|undefined} settings
 * @returns {boolean}
 */
export function isCustomTemplatesEnabled(settings) {
  return settings?.[CUSTOM_TEMPLATES_FEATURE_FLAG_KEY] === true;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeCustomTemplatesEnabled(value) {
  return value === true;
}

/** Master owner may toggle the gym-wide custom-templates rollout flag. */
export function canManageCustomTemplatesFeatureFlag(user) {
  return authIsMasterOwnerUser(user);
}
