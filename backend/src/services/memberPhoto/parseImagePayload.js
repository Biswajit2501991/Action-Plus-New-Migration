/** Reject corrupt/garbage uploads (e.g. signed URLs mistaken for base64). */
export const MEMBER_PHOTO_MIN_BYTES = 256;

/**
 * Parse a member photo upload body. Accepts data URLs only — never raw HTTPS signed URLs.
 * @returns {{ mime: string, buffer: Buffer } | null}
 */
export function parseMemberPhotoImagePayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return null;

  const match = trimmed.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (!buffer?.length || buffer.length < MEMBER_PHOTO_MIN_BYTES) return null;
  return { mime, buffer };
}
