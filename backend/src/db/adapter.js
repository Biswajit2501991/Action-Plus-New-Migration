import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const databasePath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'app.db');
export const backupDirPath = path.resolve(path.dirname(databasePath), 'backups');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(backupDirPath, { recursive: true });

let db;

function configureDatabase(database) {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
}

function latestBackupFilePath() {
  try {
    const files = fs.readdirSync(backupDirPath)
      .filter((name) => name.endsWith('.db'))
      .sort();
    if (!files.length) return '';
    return path.join(backupDirPath, files[files.length - 1]);
  } catch {
    return '';
  }
}

function openDatabaseWithRecovery() {
  const candidate = new Database(databasePath);
  configureDatabase(candidate);
  try {
    const row = candidate.prepare('PRAGMA integrity_check').get();
    const ok = row && Object.values(row).some((v) => String(v).toLowerCase() === 'ok');
    if (ok) return candidate;
    candidate.close();
  } catch {
    try { candidate.close(); } catch {}
  }

  const backup = latestBackupFilePath();
  if (backup) {
    fs.copyFileSync(backup, databasePath);
  }
  const recovered = new Database(databasePath);
  configureDatabase(recovered);
  return recovered;
}

db = openDatabaseWithRecovery();

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
