import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const relativeSqlPath = process.argv[2];

if (!relativeSqlPath) {
  // eslint-disable-next-line no-console
  console.error('Usage: node scripts/run-sql.js <relative-sql-file>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sqlPath = path.resolve(backendRoot, relativeSqlPath);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

try {
  const sql = await fs.readFile(sqlPath, 'utf8');
  await client.connect();
  await client.query(sql);
  // eslint-disable-next-line no-console
  console.log(`Executed SQL file: ${relativeSqlPath}`);
} finally {
  await client.end();
}
