import {
  ATTENDANCE_NOTE_CATEGORIES,
  ATTENDANCE_NOTE_MAX_LENGTH,
} from './attendanceNotesFeature.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Strip HTML/control chars; collapse whitespace.
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeAttendanceNoteText(raw) {
  const text = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > ATTENDANCE_NOTE_MAX_LENGTH
    ? text.slice(0, ATTENDANCE_NOTE_MAX_LENGTH)
    : text;
}

/**
 * @param {unknown} category
 * @returns {string}
 */
export function normalizeAttendanceNoteCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  if (!ATTENDANCE_NOTE_CATEGORIES.includes(key)) {
    throw Object.assign(new Error('invalid-note-category'), { status: 400 });
  }
  return key;
}

/**
 * @param {{ noteCategory?: unknown, note?: unknown }} payload
 * @returns {{ noteCategory: string, note: string }}
 */
export function validateAttendanceNotePayload(payload) {
  const noteCategory = normalizeAttendanceNoteCategory(payload?.noteCategory);
  const note = sanitizeAttendanceNoteText(payload?.note);
  if (!note) {
    throw Object.assign(new Error('note-required'), { status: 400 });
  }
  if (noteCategory === 'other' && note.length < 2) {
    throw Object.assign(new Error('note-too-short'), { status: 400 });
  }
  return { noteCategory, note };
}

/**
 * @param {{ noteCategory: string, note: string }} row
 * @returns {string}
 */
export function formatAttendanceNoteBadge(row) {
  if (!row) return '';
  const cat = String(row.noteCategory || '').trim().toLowerCase();
  const text = String(row.note || '').trim();
  if (!text) return '';
  if (cat === 'optional') return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  if (cat === 'rain' || cat === 'traffic' || cat === 'medical' || cat === 'family' || cat === 'personal') {
    return `Late — ${label}`;
  }
  if (cat === 'other') return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}
