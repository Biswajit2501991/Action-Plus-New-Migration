/**
 * Rename public."members (Phase 1 core)" → public.members via direct Postgres.
 *
 * Requires backend/.env:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...pooler.supabase.com:6543/postgres
 *
 * Or run migrations/supabase_rename_members.sql manually in Supabase SQL Editor.
 *
 * Usage: npm run db:rename-members
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_URL = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

function fail(msg) {
  console.error(`\n[rename-members] ERROR: ${msg}`);
  process.exit(1);
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

async function main() {
  if (!DB_URL) {
    fail(
      'Set SUPABASE_DB_URL (Supabase → Project Settings → Database → Connection string URI) in backend/.env,\n'
      + 'or run migrations/supabase_rename_members.sql in the SQL Editor.',
    );
  }

  const sqlPath = path.resolve(__dirname, '../migrations/supabase_rename_members.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');

  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const hasLegacy = await tableExists(client, 'members (Phase 1 core)');
    const hasNew = await tableExists(client, 'members');

    if (hasNew && !hasLegacy) {
      console.log('[rename-members] public.members already exists — nothing to do.');
      return;
    }
    if (hasNew && hasLegacy) {
      fail('Both "members (Phase 1 core)" and members exist. Resolve manually before renaming.');
    }
    if (!hasLegacy) {
      fail('Legacy table "members (Phase 1 core)" not found.');
    }

    await client.query(sql);
    console.log('[rename-members] Done. Restart the backend to use public.members.');
  } finally {
    await client.end();
  }
}

main().catch((err) => fail(err.message || err));
