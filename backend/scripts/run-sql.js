import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const relativeSqlPath = process.argv[2];

if (!relativeSqlPath) {
  // eslint-disable-next-line no-console
  console.error('Usage: node scripts/run-sql.js <relative-sql-file>');
  process.exit(1);
}

const sqlPath = path.resolve(backendRoot, relativeSqlPath);
const databasePath = process.env.DATABASE_PATH || path.resolve(backendRoot, 'data', 'app.db');
const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

try {
  const sql = await fs.readFile(sqlPath, 'utf8');
  db.exec(sql);
  // eslint-disable-next-line no-console
  console.log(`Executed SQL file: ${relativeSqlPath}`);
} finally {
  db.close();
}
