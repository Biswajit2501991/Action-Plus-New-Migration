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
 * Settings bulk sends sparse patches (e.g. one feature flag). Merge onto the
 * current row so omitted keys — especially opt-in flags in config_json — are
 * not rewritten as false/null.
 */
export function mergeSettingsBulkPatch(existing, incoming) {
  const ex = existing && typeof existing === 'object' ? existing : {};
  const inc = incoming && typeof incoming === 'object' ? incoming : {};
  return { ...ex, ...inc };
}

/** Opt-in / config_json keys that must only change when present on the patch. */
export const SETTINGS_CONFIG_JSON_KEYS = [
  'medicalQuestionnaireTemplate',
  'acknowledgementTemplate',
  'acknowledgementUnder18Template',
  'gmailWelcomeTemplate',
  'smsTemplatePresetVersion',
  'customTemplatesEnabled',
  'attendanceNotesEnabled',
  'paymentQrInReminderEnabled',
];

const OPT_IN_BOOL_KEYS = new Set([
  'customTemplatesEnabled',
  'attendanceNotesEnabled',
  'paymentQrInReminderEnabled',
]);

/**
 * Build settings_app_config write payload from the live DB row + sparse incoming
 * patch. Keys absent from `incoming` keep their live values — this prevents
 * stale full-flag clients from wiping attendanceNotesEnabled / customTemplates.
 */
export function buildSettingsAppConfigWriteFromLive(liveConfigRow, incoming, existingSettings = null) {
  const live = liveConfigRow && typeof liveConfigRow === 'object' ? liveConfigRow : {};
  const patch = incoming && typeof incoming === 'object' ? incoming : {};
  const ex = existingSettings && typeof existingSettings === 'object' ? existingSettings : {};
  const liveCfg =
    live.config_json && typeof live.config_json === 'object' ? { ...live.config_json } : {};

  const nextCfg = { ...liveCfg };

  // When config_json is partial (legacy drift), keep enabled opt-in flags from merged settings.
  for (const key of OPT_IN_BOOL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(liveCfg, key)) continue;
    if (ex[key] === true) nextCfg[key] = true;
  }

  for (const key of SETTINGS_CONFIG_JSON_KEYS) {
    if (OPT_IN_BOOL_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(liveCfg, key)) continue;
    if (Object.prototype.hasOwnProperty.call(ex, key) && ex[key] != null) {
      nextCfg[key] = ex[key];
    }
  }

  for (const key of SETTINGS_CONFIG_JSON_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (OPT_IN_BOOL_KEYS.has(key)) {
      nextCfg[key] = patch[key] === true;
    } else {
      nextCfg[key] = patch[key] == null ? null : patch[key];
    }
  }

  // Always persist known opt-in keys as booleans so reads stay consistent.
  nextCfg.customTemplatesEnabled = nextCfg.customTemplatesEnabled === true;
  nextCfg.attendanceNotesEnabled = nextCfg.attendanceNotesEnabled === true;
  nextCfg.paymentQrInReminderEnabled = nextCfg.paymentQrInReminderEnabled === true;

  const fineSmsEnabled = Object.prototype.hasOwnProperty.call(patch, 'fineSmsEnabled')
    ? patch.fineSmsEnabled !== false
    : live.fine_sms_enabled !== false;
  const fineSmsGraceDays = Object.prototype.hasOwnProperty.call(patch, 'fineSmsGraceDays')
    ? Number(patch.fineSmsGraceDays || 0)
    : Number(live.fine_sms_grace_days || 0);
  const fineSmsImmediateRoles = Object.prototype.hasOwnProperty.call(patch, 'fineSmsImmediateRoles')
    ? (Array.isArray(patch.fineSmsImmediateRoles) ? patch.fineSmsImmediateRoles : [])
    : (live.fine_sms_immediate_roles_json || []);
  const financeUseEstimatedExpense = Object.prototype.hasOwnProperty.call(
    patch,
    'financeUseEstimatedExpense',
  )
    ? patch.financeUseEstimatedExpense !== false
    : live.finance_use_estimated_expense !== false;

  return {
    fine_sms_enabled: fineSmsEnabled,
    fine_sms_grace_days: fineSmsGraceDays,
    fine_sms_immediate_roles_json: fineSmsImmediateRoles,
    finance_use_estimated_expense: financeUseEstimatedExpense,
    config_json: {
      medicalQuestionnaireTemplate: nextCfg.medicalQuestionnaireTemplate || null,
      acknowledgementTemplate: nextCfg.acknowledgementTemplate || null,
      acknowledgementUnder18Template: nextCfg.acknowledgementUnder18Template || null,
      gmailWelcomeTemplate: nextCfg.gmailWelcomeTemplate || null,
      smsTemplatePresetVersion: nextCfg.smsTemplatePresetVersion || null,
      customTemplatesEnabled: nextCfg.customTemplatesEnabled === true,
      attendanceNotesEnabled: nextCfg.attendanceNotesEnabled === true,
      paymentQrInReminderEnabled: nextCfg.paymentQrInReminderEnabled === true,
    },
  };
}

/** @deprecated Prefer buildSettingsAppConfigWriteFromLive for sparse patches. */
export function buildSettingsAppConfigWrite(s) {
  return buildSettingsAppConfigWriteFromLive({}, s || {});
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
