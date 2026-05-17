/**
 * Build a pooler DATABASE_URL with URL-encoded password (safe for special chars).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='your-raw-password' node scripts/print-database-url.js
 */

import dotenv from 'dotenv';

dotenv.config();

const password = String(process.env.SUPABASE_DB_PASSWORD || '').trim();
const ref = String(process.env.SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const region = String(process.env.SUPABASE_DB_REGION || 'ap-south-1').trim();

if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD to your database password (not the service_role key).');
  process.exit(1);
}
if (!ref) {
  console.error('Set SUPABASE_URL in backend/.env');
  process.exit(1);
}

const host = process.env.SUPABASE_POOLER_HOST || `aws-1-${region}.pooler.supabase.com`;
const port = process.env.SUPABASE_POOLER_PORT || '6543';
const user = `postgres.${ref}`;
const encoded = encodeURIComponent(password);
const url = `postgresql://${user}:${encoded}@${host}:${port}/postgres`;

console.log('\nAdd to backend/.env:\n');
console.log(`DATABASE_URL=${url}`);
console.log('\nThen run: npm run db:post-rename-setup\n');
