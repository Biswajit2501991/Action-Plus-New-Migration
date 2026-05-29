/**
 * Initials for staff header avatar when no photo is uploaded.
 * "Biswajit Kumar" → BK, "Raja" → R
 * @param {string} name
 * @returns {string}
 */
export function staffInitialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * @param {{ photo?: string | null, avatar?: string | null } | null | undefined} user
 * @returns {string}
 */
export function staffPhotoSrcFromUser(user) {
  return String(user?.photo || user?.avatar || '').trim();
}
