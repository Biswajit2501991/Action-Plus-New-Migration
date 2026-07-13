/** Attendance notes feature flag + category helpers (prod parity). */

export const ATTENDANCE_NOTES_FEATURE_FLAG_KEY = "attendanceNotesEnabled";

export const ATTENDANCE_NOTE_CATEGORIES = [
  "traffic",
  "rain",
  "medical",
  "family",
  "personal",
  "other",
  "optional",
] as const;

export type AttendanceNoteCategory = (typeof ATTENDANCE_NOTE_CATEGORIES)[number];

export const ATTENDANCE_NOTE_CATEGORY_LABELS: Record<AttendanceNoteCategory, string> = {
  traffic: "Traffic",
  rain: "Rain",
  medical: "Medical",
  family: "Family",
  personal: "Personal",
  other: "Other",
  optional: "Optional",
};

export const ATTENDANCE_NOTE_MAX_LENGTH = 250;

export function isAttendanceNotesEnabled(settings?: Record<string, unknown> | null) {
  return settings?.[ATTENDANCE_NOTES_FEATURE_FLAG_KEY] === true;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeAttendanceNoteText(raw: unknown) {
  const text = String(raw ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > ATTENDANCE_NOTE_MAX_LENGTH
    ? text.slice(0, ATTENDANCE_NOTE_MAX_LENGTH)
    : text;
}

export function normalizeAttendanceNoteCategory(category: unknown): AttendanceNoteCategory {
  const key = String(category || "")
    .trim()
    .toLowerCase();
  if (!(ATTENDANCE_NOTE_CATEGORIES as readonly string[]).includes(key)) {
    throw new Error("invalid-note-category");
  }
  return key as AttendanceNoteCategory;
}

export function validateAttendanceNotePayload(payload: {
  noteCategory?: unknown;
  note?: unknown;
}) {
  const noteCategory = normalizeAttendanceNoteCategory(payload?.noteCategory);
  const note = sanitizeAttendanceNoteText(payload?.note);
  if (!note) throw new Error("note-required");
  if (noteCategory === "other" && note.length < 2) throw new Error("note-too-short");
  return { noteCategory, note };
}

export function formatAttendanceNoteBadge(row?: {
  noteCategory?: string | null;
  note?: string | null;
} | null) {
  if (!row) return "";
  const cat = String(row.noteCategory || "")
    .trim()
    .toLowerCase();
  const text = String(row.note || "").trim();
  if (!text) return "";
  if (cat === "optional") return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  if (["rain", "traffic", "medical", "family", "personal"].includes(cat)) {
    return `Late — ${label}`;
  }
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

/** Compare first login ISO against branch shift start (HH:MM). */
export function isLoginLateForShift(
  firstLoginAtIso?: string | Date | null,
  shiftStartTime?: string | null,
  options: { graceMinutes?: number; shiftTimezone?: string | null } = {},
) {
  const loginMs = Date.parse(String(firstLoginAtIso || ""));
  if (!Number.isFinite(loginMs)) return false;
  const shift = String(shiftStartTime || "").trim();
  if (!shift) return false;
  const match = shift.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  const shiftMinutes = hours * 60 + minutes;

  const tzAlias: Record<string, string> = {
    IST: "Asia/Kolkata",
    AEST: "Australia/Sydney",
  };
  const tzRaw = String(options?.shiftTimezone || "").trim();
  const timeZone = tzAlias[tzRaw] || tzRaw || null;

  let loginMinutes: number | null = null;
  if (timeZone) {
    try {
      const login = new Date(loginMs);
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(login);
      const pick = (type: string) => parts.find((p) => p.type === type)?.value || "";
      const hh = Number(pick("hour"));
      const mm = Number(pick("minute"));
      if (Number.isFinite(hh) && Number.isFinite(mm)) loginMinutes = hh * 60 + mm;
    } catch {
      loginMinutes = null;
    }
  }

  if (!Number.isFinite(loginMinutes as number)) {
    const login = new Date(loginMs);
    loginMinutes = login.getHours() * 60 + login.getMinutes();
  }

  const graceMs = Math.max(0, Number(options.graceMinutes) || 0) * 60 * 1000;
  const diffMs = ((loginMinutes as number) - shiftMinutes) * 60 * 1000;
  return diffMs > graceMs;
}

export function resolveBranchShiftConfig(
  gymCodes: Array<{
    id?: string;
    shiftStartTime?: string | null;
    shift_start_time?: string | null;
    shiftTimezone?: string | null;
    shift_timezone?: string | null;
  }>,
  gymCodeId?: string | null,
) {
  const id = String(gymCodeId || "").trim();
  const list = Array.isArray(gymCodes) ? gymCodes : [];
  const row = list.find((g) => String(g?.id || "") === id) || null;
  const shiftStartTime = row?.shiftStartTime
    ? String(row.shiftStartTime).trim()
    : row?.shift_start_time
      ? String(row.shift_start_time).trim()
      : null;
  const shiftTimezone =
    String(row?.shiftTimezone || row?.shift_timezone || "IST").trim() || "IST";
  return { shiftStartTime: shiftStartTime || null, shiftTimezone };
}
