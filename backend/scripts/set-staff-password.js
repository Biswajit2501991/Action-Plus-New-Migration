/**
 * Set a staff login password (bcrypt). Password via env APG_NEW_PASSWORD or prompt.
 * Usage: cd backend && APG_STAFF_ID=owner APG_NEW_PASSWORD='...' node scripts/set-staff-password.js
 */
import readline from 'node:readline';
import dotenv from 'dotenv';
import { setStaffPassword } from '../src/auth/staffAuth.js';

dotenv.config();

const staffId = String(process.env.APG_STAFF_ID || process.argv[2] || '').trim();
if (!staffId) {
  console.error('Usage: APG_STAFF_ID=owner APG_NEW_PASSWORD=secret node scripts/set-staff-password.js');
  process.exit(1);
}

async function readPasswordHidden() {
  if (process.env.APG_NEW_PASSWORD) return String(process.env.APG_NEW_PASSWORD);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('New password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const newPassword = await readPasswordHidden();
if (!newPassword || newPassword.length < 4) {
  console.error('Password too short.');
  process.exit(1);
}

await setStaffPassword(staffId, newPassword);
console.log(`Password updated for: ${staffId}`);
