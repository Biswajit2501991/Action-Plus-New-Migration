import { LOOKUP_CATEGORIES } from '../tables.js';

/** Keys stored in settings_lookup_values — must never be sourced from config_json. */
export const SETTINGS_LOOKUP_KEYS = LOOKUP_CATEGORIES.map(([key]) => key);

/**
 * Legacy settings were embedded in config_json; empty arrays there overwrote
 * settings_lookup_values on read and could wipe the DB on bulk sync.
 */
export function stripSettingsLookupKeys(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = { ...obj };
  for (const key of SETTINGS_LOOKUP_KEYS) {
    delete out[key];
  }
  return out;
}

/** Apply config_json without clobbering lookup lists built from settings_lookup_values. */
export function applySettingsConfigJson(settings, configRow) {
  if (!configRow) return settings;
  settings.fineSmsEnabled = configRow.fine_sms_enabled !== false;
  settings.fineSmsGraceDays = Number(configRow.fine_sms_grace_days || 0);
  settings.fineSmsImmediateRoles = configRow.fine_sms_immediate_roles_json || [];
  settings.financeUseEstimatedExpense = configRow.finance_use_estimated_expense !== false;
  const cfg = configRow.config_json && typeof configRow.config_json === 'object'
    ? configRow.config_json
    : {};
  Object.assign(settings, stripSettingsLookupKeys(cfg));
  return settings;
}

/**
 * Merge lookup arrays for bulk PUT: never replace a non-empty DB list with an empty payload.
 */
export function preserveNonEmptyLookups(incoming, existing) {
  const s = incoming && typeof incoming === 'object' ? { ...incoming } : {};
  const ex = existing && typeof existing === 'object' ? existing : {};
  for (const key of SETTINGS_LOOKUP_KEYS) {
    const inc = Array.isArray(s[key]) ? s[key] : null;
    const exList = Array.isArray(ex[key]) ? ex[key] : [];
    if (inc !== null && inc.length === 0 && exList.length > 0) {
      s[key] = exList;
    }
    if (!Array.isArray(s[key]) && exList.length > 0) {
      s[key] = exList;
    }
  }
  return s;
}

/**
 * Refuse to delete every row in a category when the payload sends an empty list
 * but the database still has active values (prevents accidental mass wipe).
 */
export function shouldSkipLookupCategorySync(wantList, haveRows) {
  const want = Array.isArray(wantList) ? wantList : [];
  const have = Array.isArray(haveRows) ? haveRows : [];
  return want.length === 0 && have.length > 0;
}

/**
 * Duplicate check for lookup insert. Same label may exist on different branches.
 * @returns {object|null}
 */
export function findActiveLookupDuplicate(existingRows, {
  value,
  createdByGymCodeId = null,
  createdByRole = null,
}) {
  const val = String(value || '').trim();
  if (!val) return null;
  const rows = (Array.isArray(existingRows) ? existingRows : [])
    .filter((r) => r.is_active !== false && String(r.value || '').trim() === val);

  const branch = String(createdByGymCodeId || '').trim();
  const role = String(createdByRole || '').trim().toLowerCase();

  for (const row of rows) {
    const rowBranch = String(row.created_by_gym_code_id || '').trim();
    const rowRole = String(row.created_by_role || '').trim().toLowerCase();

    if (branch) {
      if (rowBranch === branch) return row;
      continue;
    }

    if (!rowBranch || rowRole === 'master_owner' || rowRole === 'owner') return row;
    if (!role || role === 'master_owner' || role === 'owner') {
      if (!rowBranch) return row;
    }
  }
  return null;
}
