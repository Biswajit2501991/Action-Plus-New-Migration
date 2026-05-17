/**
 * One-time: bcrypt-hash all staff_users.password_hash values that are still plaintext.
 * Usage: cd backend && node scripts/hash-staff-passwords.js
 */
import dotenv from 'dotenv';
import { getSupabase, gymId } from '../src/db/supabase/client.js';
import { hashPassword, isBcryptHash } from '../src/auth/passwords.js';

dotenv.config();

const sb = getSupabase();
const gid = gymId();

const { data: rows, error } = await sb.from('staff_users').select('id, staff_login_id, password_hash').eq('gym_id', gid);
if (error) {
  console.error(error.message);
  process.exit(1);
}

let migrated = 0;
let skipped = 0;
for (const row of rows || []) {
  const stored = String(row.password_hash || '');
  if (!stored || isBcryptHash(stored)) {
    skipped += 1;
    continue;
  }
  const password_hash = await hashPassword(stored);
  const { error: upErr } = await sb.from('staff_users').update({ password_hash }).eq('id', row.id);
  if (upErr) {
    console.error(`Failed ${row.staff_login_id}:`, upErr.message);
    process.exit(1);
  }
  console.log(`Hashed: ${row.staff_login_id}`);
  migrated += 1;
}

console.log(`Done. migrated=${migrated} skipped=${skipped} total=${(rows || []).length}`);
