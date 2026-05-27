import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function isBcryptHash(value) {
  const s = String(value || '');
  return /^\$2[aby]\$\d{2}\$/.test(s);
}

export async function hashPassword(plain) {
  const text = String(plain || '');
  if (!text) throw new Error('password-required');
  return bcrypt.hash(text, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, stored) {
  const hash = String(stored || '');
  if (!hash) return false;
  if (isBcryptHash(hash)) {
    try {
      return await bcrypt.compare(String(plain || ''), hash);
    } catch {
      return false;
    }
  }
  return String(plain || '') === hash;
}

/** Hash plaintext; keep existing bcrypt; ignore empty plain. */
export async function resolvePasswordHash(plain, existingHash) {
  const existing = String(existingHash || '');
  const next = String(plain || '').trim();
  if (!next) return existing;
  if (isBcryptHash(next)) return next;
  return hashPassword(next);
}
