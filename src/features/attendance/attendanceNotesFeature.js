/** Gym-wide feature flag — persisted in settings_app_config.config_json. */
export const ATTENDANCE_NOTES_FEATURE_FLAG_KEY = 'attendanceNotesEnabled';

export const ATTENDANCE_NOTE_CATEGORIES = [
  'traffic',
  'rain',
  'medical',
  'family',
  'personal',
  'other',
  'optional',
];

export const ATTENDANCE_NOTE_CATEGORY_LABELS = {
  traffic: 'Traffic',
  rain: 'Rain',
  medical: 'Medical',
  family: 'Family',
  personal: 'Personal',
  other: 'Other',
  optional: 'Optional',
};

export const ATTENDANCE_NOTE_MAX_LENGTH = 250;

export const ATTENDANCE_NOTE_RETENTION_DAYS = 60;

/**
 * @param {Record<string, unknown>|null|undefined} settings
 * @returns {boolean}
 */
export function isAttendanceNotesEnabled(settings) {
  return settings?.[ATTENDANCE_NOTES_FEATURE_FLAG_KEY] === true;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeAttendanceNotesEnabled(value) {
  return value === true;
}
