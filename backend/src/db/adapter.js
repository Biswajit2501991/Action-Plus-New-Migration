import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const databasePath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'app.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

function normalizeSql(text) {
  // Keep common PG syntax compatible with SQLite.
  return String(text || '')
    .replace(/\$\d+/g, '?')
    .replace(/\bnow\(\)/gi, 'CURRENT_TIMESTAMP');
}

function mapResult(statement, params = []) {
  const sql = normalizeSql(statement);
  const trimmed = sql.trim().toLowerCase();
  if (trimmed.startsWith('select') || trimmed.startsWith('with') || trimmed.includes(' returning ')) {
    const stmt = db.prepare(sql);
    if (trimmed.includes(' returning ')) {
      const row = stmt.get(...params);
      const rows = row ? [row] : [];
      return { rows, rowCount: rows.length };
    }
    const rows = stmt.all(...params);
    return { rows, rowCount: rows.length };
  }

  const stmt = db.prepare(sql);
  const info = stmt.run(...params);
  return { rows: [], rowCount: info.changes || 0 };
}

export async function query(text, params = []) {
  return mapResult(text, params);
}

export async function withTransaction(work) {
  const client = {
    query: (text, params = []) => mapResult(text, params),
  };
  db.exec('BEGIN');
  try {
    const out = await work(client);
    db.exec('COMMIT');
    return out;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
