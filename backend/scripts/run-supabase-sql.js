/**
 * Run a SQL file against Supabase Postgres (DDL / publication setup).
 *
 * Requires SUPABASE_DB_URL in backend/.env
 * Usage: node scripts/run-supabase-sql.js migrations/supabase_enable_realtime.sql
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const relativeSqlPath = process.argv[2];
const DB_URL = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

if (!relativeSqlPath) {
  console.error('Usage: node scripts/run-supabase-sql.js <relative-sql-file>');
  process.exit(1);
}

if (!DB_URL) {
  console.error('Set SUPABASE_DB_URL in backend/.env (Database connection URI).');
  process.exit(1);
}

const sqlPath = path.resolve(__dirname, '..', relativeSqlPath);
const sql = await fs.readFile(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Executed: ${relativeSqlPath}`);
} finally {
  await client.end();
}
