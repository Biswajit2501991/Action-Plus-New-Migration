import express from 'express';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { env } from './config/env.js';
import { query } from './db/adapter.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requirePermission } from './middleware/permissions.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-apg-process-token, X-APG-Process-Token, x-apg-user-id, x-apg-sandbox-id, x-apg-test-profile',
  );
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

function buildSingleTenantClaims(user) {
  const fallbackRole = String(user?.username || '').toLowerCase() === 'owner' || String(user?.id || '').toLowerCase() === 'owner'
    ? 'owner'
    : 'staff';
  return {
    roles: [fallbackRole],
    permissions: ['*'],
  };
}

function signAuthToken({ userId, roles, permissions }) {
  return jwt.sign({ userId, roles, permissions }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

const DB_FILE_PATH = path.resolve(process.cwd(), env.DATABASE_PATH);
const DB_BACKUP_DIR = path.resolve(path.dirname(DB_FILE_PATH), 'backups');
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const MAX_DB_BACKUPS = Number(process.env.DB_BACKUP_MAX_FILES || 30);
const MAX_BACKUP_TOTAL_BYTES = Number(process.env.DB_BACKUP_MAX_TOTAL_BYTES || (2 * 1024 * 1024 * 1024));
const AUTO_BACKUP_INTERVAL_MS = Number(process.env.DB_BACKUP_INTERVAL_MS || (45 * 60 * 1000));
const AUTO_BACKUP_MAX_AGE_DAYS = Number(process.env.DB_BACKUP_MAX_AGE_DAYS || 60);
const COMPRESS_OLD_BACKUPS = process.env.DB_BACKUP_COMPRESS_OLD !== 'false';
const COMPRESS_AFTER_MS = Number(process.env.DB_BACKUP_COMPRESS_AFTER_MS || (24 * 60 * 60 * 1000));
let backupQueue = Promise.resolve();
let lastBackupAtMs = 0;

function makeBackupFilename(reason = 'autosave') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = String(reason || 'autosave').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return `app-${safeReason}-${stamp}.db`;
}

async function trimOldBackups() {
  await pruneBackups({ keepLatest: MAX_DB_BACKUPS, maxAgeDays: AUTO_BACKUP_MAX_AGE_DAYS, hardCapBytes: MAX_BACKUP_TOTAL_BYTES, compressOld: COMPRESS_OLD_BACKUPS });
}

async function createDatabaseBackup(reason = 'autosave') {
  await fs.mkdir(DB_BACKUP_DIR, { recursive: true });
  const target = path.join(DB_BACKUP_DIR, makeBackupFilename(reason));
  await fs.copyFile(DB_FILE_PATH, target);
  lastBackupAtMs = Date.now();
  await trimOldBackups();
}

function queueDatabaseBackup(reason, options = {}) {
  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && (now - lastBackupAtMs) < AUTO_BACKUP_INTERVAL_MS) return;
  backupQueue = backupQueue
    .then(() => createDatabaseBackup(reason))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('DB backup warning:', err?.message || err);
    });
}

async function computeStorageUsage() {
  const payload = {
    dbBytes: 0,
    backupsBytes: 0,
    backupFileCount: 0,
    totalBytes: 0,
  };
  try {
    const stat = await fs.stat(DB_FILE_PATH);
    payload.dbBytes = Number(stat.size || 0);
  } catch {}
  try {
    const entries = await fs.readdir(DB_BACKUP_DIR, { withFileTypes: true });
    const backupFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.db'));
    payload.backupFileCount = backupFiles.length;
    const sizes = await Promise.all(
      backupFiles.map(async (entry) => {
        try {
          const stat = await fs.stat(path.join(DB_BACKUP_DIR, entry.name));
          return Number(stat.size || 0);
        } catch {
          return 0;
        }
      }),
    );
    payload.backupsBytes = sizes.reduce((sum, n) => sum + n, 0);
  } catch {}
  payload.totalBytes = payload.dbBytes + payload.backupsBytes;
  return payload;
}

async function listBackupNames() {
  try {
    const entries = await fs.readdir(DB_BACKUP_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.db') || entry.name.endsWith('.db.gz')))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function readBackupEntries() {
  await fs.mkdir(DB_BACKUP_DIR, { recursive: true });
  const entries = await fs.readdir(DB_BACKUP_DIR, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.db') || entry.name.endsWith('.db.gz')))
    .map(async (entry) => {
      try {
        const fullPath = path.join(DB_BACKUP_DIR, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          size: Number(stat.size || 0),
          mtimeMs: Number(stat.mtimeMs || 0),
          gz: entry.name.endsWith('.gz'),
        };
      } catch {
        return null;
      }
    }));
  return files.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function compressBackupFile(entry) {
  if (!entry || entry.gz || !entry.path) return;
  try {
    const raw = await fs.readFile(entry.path);
    const gz = await gzipAsync(raw);
    const gzPath = `${entry.path}.gz`;
    await fs.writeFile(gzPath, gz);
    await fs.unlink(entry.path).catch(() => {});
  } catch {}
}

async function pruneBackups({ keepLatest = MAX_DB_BACKUPS, maxAgeDays = null, hardCapBytes = MAX_BACKUP_TOTAL_BYTES, compressOld = COMPRESS_OLD_BACKUPS } = {}) {
  try {
    let files = await readBackupEntries();
    const now = Date.now();
    if (compressOld) {
      const toCompress = files.filter((f) => !f.gz && (now - f.mtimeMs) > COMPRESS_AFTER_MS);
      for (const file of toCompress) {
        // Keep very recent files as plain .db for faster restore.
        await compressBackupFile(file);
      }
      files = await readBackupEntries();
    }
    if (Number(maxAgeDays) > 0) {
      const maxAgeMs = Number(maxAgeDays) * 24 * 60 * 60 * 1000;
      const tooOld = files.filter((f) => (now - f.mtimeMs) > maxAgeMs);
      await Promise.all(tooOld.map((f) => fs.unlink(f.path).catch(() => {})));
      files = await readBackupEntries();
    }
    const keepN = Math.max(1, Number(keepLatest || MAX_DB_BACKUPS));
    if (files.length > keepN) {
      const drop = files.slice(keepN);
      await Promise.all(drop.map((f) => fs.unlink(f.path).catch(() => {})));
      files = await readBackupEntries();
    }
    let total = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const cap = Math.max(64 * 1024 * 1024, Number(hardCapBytes || MAX_BACKUP_TOTAL_BYTES));
    if (total > cap) {
      const oldestFirst = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const file of oldestFirst) {
        if (total <= cap) break;
        await fs.unlink(file.path).catch(() => {});
        total -= Number(file.size || 0);
      }
    }
  } catch {}
}

async function deleteBackupFileName(fileName = '') {
  const name = String(fileName || '').trim();
  if (!name || name.includes('/') || name.includes('\\')) throw new Error('invalid-backup-name');
  const target = path.join(DB_BACKUP_DIR, name);
  await fs.unlink(target);
}

async function restoreFromBackupFileName(fileName = '') {
  const name = String(fileName || '').trim();
  if (!name || name.includes('/') || name.includes('\\')) throw new Error('invalid-backup-name');
  const sourcePath = path.join(DB_BACKUP_DIR, name);
  let openPath = sourcePath;
  let tempDir = '';
  if (name.endsWith('.gz')) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-restore-'));
    openPath = path.join(tempDir, 'restore.db');
    const zipped = await fs.readFile(sourcePath);
    const raw = await gunzipAsync(zipped);
    await fs.writeFile(openPath, raw);
  }
  const backupDb = new Database(openPath, { readonly: true });
  try {
    const rows = backupDb.prepare('select key, value_json from app_kv').all();
    for (const row of rows) {
      await query(
        `insert into app_kv (key, value_json, updated_at)
         values ($1, $2, CURRENT_TIMESTAMP)
         on conflict(key) do update
         set value_json = excluded.value_json,
             updated_at = CURRENT_TIMESTAMP`,
        [row.key, row.value_json],
      );
    }
  } finally {
    backupDb.close();
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readJsonCollection(key, fallback = []) {
  const result = await query(
    `select value_json
     from app_kv
     where key = $1
     limit 1`,
    [key],
  );
  if (!result.rowCount) return fallback;
  try {
    const parsed = JSON.parse(result.rows[0].value_json || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonCollection(key, value) {
  const payload = JSON.stringify(Array.isArray(value) ? value : []);
  await query(
    `insert into app_kv (key, value_json, updated_at)
     values ($1, $2, CURRENT_TIMESTAMP)
     on conflict(key) do update
     set value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    [key, payload],
  );
}

function readSandboxScope(req) {
  const testProfile = String(req.headers['x-apg-test-profile'] || '').trim() === '1';
  const sandboxId = String(req.headers['x-apg-sandbox-id'] || '').trim();
  const userId = String(req.headers['x-apg-user-id'] || '').trim();
  if (!testProfile || !sandboxId) return null;
  return { sandboxId, userId };
}

async function readScopedCollection(req, key, fallback = []) {
  const allRows = await readJsonCollection(key, fallback);
  const scope = readSandboxScope(req);
  if (!scope) return allRows;
  return allRows.filter((row) => String(row?.sandboxId || '') === scope.sandboxId);
}

async function writeScopedCollection(req, key, incomingRows = []) {
  const scope = readSandboxScope(req);
  if (!scope) {
    await writeJsonCollection(key, incomingRows);
    return;
  }
  const allRows = await readJsonCollection(key, []);
  const kept = allRows.filter((row) => String(row?.sandboxId || '') !== scope.sandboxId);
  const scopedRows = (Array.isArray(incomingRows) ? incomingRows : []).map((row) => ({
    ...(row && typeof row === 'object' ? row : {}),
    sandboxId: scope.sandboxId,
    createdByTestUserId: scope.userId || (row && row.createdByTestUserId) || '',
  }));
  await writeJsonCollection(key, [...kept, ...scopedRows]);
}

async function readScopedSettings(req) {
  const scope = readSandboxScope(req);
  if (!scope) return readJsonValue('apg.settings', {});
  return readJsonValue(`apg.settings.sandbox.${scope.sandboxId}`, {});
}

async function writeScopedSettings(req, value) {
  const scope = readSandboxScope(req);
  if (!scope) {
    await writeJsonValue('apg.settings', value || {});
    return;
  }
  await writeJsonValue(`apg.settings.sandbox.${scope.sandboxId}`, value || {});
}

async function purgeSandboxData(sandboxId) {
  const id = String(sandboxId || '').trim();
  if (!id) return;
  const keys = ['apg.members', 'apg.visitors', 'apg.logs', 'apg.finance', 'apg.sms.events'];
  for (const key of keys) {
    const rows = await readJsonCollection(key, []);
    const nextRows = rows.filter((row) => String(row?.sandboxId || '') !== id);
    await writeJsonCollection(key, nextRows);
  }
  await writeJsonValue(`apg.settings.sandbox.${id}`, {});
}

async function readJsonValue(key, fallback = null) {
  const result = await query(
    `select value_json
     from app_kv
     where key = $1
     limit 1`,
    [key],
  );
  if (!result.rowCount) return fallback;
  try {
    return JSON.parse(result.rows[0].value_json || 'null');
  } catch {
    return fallback;
  }
}

async function writeJsonValue(key, value) {
  const payload = JSON.stringify(value);
  await query(
    `insert into app_kv (key, value_json, updated_at)
     values ($1, $2, CURRENT_TIMESTAMP)
     on conflict(key) do update
     set value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    [key, payload],
  );
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, service: 'gym-backend', env: env.NODE_ENV });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'gym-backend', env: env.NODE_ENV });
});

function allowProcessControl(req, res) {
  if (!env.PROCESS_CONTROL_ENABLED) {
    return res.status(403).json({
      error: 'process-control-disabled',
      message: 'Backend process control is disabled. Set PROCESS_CONTROL_ENABLED=true to allow restart/stop/start.',
    });
  }
  const token = env.PROCESS_CONTROL_TOKEN;
  if (token) {
    const fromHeader = req.headers['x-apg-process-token'];
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (fromHeader !== token && auth !== token) {
      return res.status(401).json({ error: 'process-control-unauthorized', message: 'Invalid process control token.' });
    }
  }
  return null;
}

app.post('/api/process/stop', (req, res) => {
  const denied = allowProcessControl(req, res);
  if (denied) return;
  res.json({
    ok: true,
    action: 'stop',
    message: 'Server is shutting down. Start it again from your terminal, PM2, or desktop app.',
  });
  res.on('finish', () => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
});

app.post('/api/process/restart', (req, res) => {
  const denied = allowProcessControl(req, res);
  if (denied) return;
  res.json({
    ok: true,
    action: 'restart',
    message: 'Server process will exit. Use a process manager (PM2, launchd, etc.) to bring it back up.',
  });
  res.on('finish', () => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
});

app.post('/api/process/start', (req, res) => {
  const denied = allowProcessControl(req, res);
  if (denied) return;
  const script = String(env.APG_BACKEND_START_SCRIPT || '').trim();
  if (!script) {
    return res.status(501).json({
      error: 'start-not-configured',
      message:
        'Turn On is not configured. Set APG_BACKEND_START_SCRIPT on the server to a shell command that starts the backend, or start it manually.',
    });
  }
  try {
    const cwd = path.resolve(process.cwd());
    const child =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', script], {
            detached: true,
            stdio: 'ignore',
            cwd,
            windowsHide: true,
          })
        : spawn('/bin/sh', ['-c', script], {
            detached: true,
            stdio: 'ignore',
            cwd,
          });
    child.unref();
    return res.json({
      ok: true,
      action: 'start',
      message: 'Start script was launched in the background.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'start-failed', message: String(error?.message || error) });
  }
});

app.get('/api/members', async (req, res) => {
  const members = await readScopedCollection(req, 'apg.members', []);
  res.json(members);
});

app.put('/api/members/bulk', async (req, res) => {
  await writeScopedCollection(req, 'apg.members', req.body?.members || []);
  queueDatabaseBackup('members-bulk');
  res.json({ ok: true });
});

app.get('/api/visitors', async (req, res) => {
  const visitors = await readScopedCollection(req, 'apg.visitors', []);
  res.json(visitors);
});

app.put('/api/visitors/bulk', async (req, res) => {
  await writeScopedCollection(req, 'apg.visitors', req.body?.visitors || []);
  queueDatabaseBackup('visitors-bulk');
  res.json({ ok: true });
});

app.get('/api/users', async (_req, res) => {
  const users = await readJsonCollection('apg.users', []);
  res.json(users);
});

app.put('/api/users/bulk', async (req, res) => {
  await writeJsonCollection('apg.users', req.body?.users || []);
  queueDatabaseBackup('users-bulk');
  res.json({ ok: true });
});

app.get('/api/settings', async (req, res) => {
  const settings = await readScopedSettings(req);
  res.json(settings || {});
});

app.put('/api/settings/bulk', async (req, res) => {
  await writeScopedSettings(req, req.body?.settings || {});
  queueDatabaseBackup('settings-bulk');
  res.json({ ok: true });
});

app.get('/api/logs', async (req, res) => {
  const logs = await readScopedCollection(req, 'apg.logs', []);
  res.json(logs);
});

app.put('/api/logs/bulk', async (req, res) => {
  await writeScopedCollection(req, 'apg.logs', req.body?.logs || []);
  queueDatabaseBackup('logs-bulk');
  res.json({ ok: true });
});

app.get('/api/finance', async (req, res) => {
  const finance = await readScopedCollection(req, 'apg.finance', []);
  res.json(finance);
});

app.put('/api/finance/bulk', async (req, res) => {
  await writeScopedCollection(req, 'apg.finance', req.body?.finance || []);
  queueDatabaseBackup('finance-bulk');
  res.json({ ok: true });
});

app.get('/api/sms-events', async (req, res) => {
  const events = await readScopedCollection(req, 'apg.sms.events', []);
  res.json(events);
});

app.put('/api/sms-events/bulk', async (req, res) => {
  await writeScopedCollection(req, 'apg.sms.events', req.body?.smsEvents || []);
  queueDatabaseBackup('sms-events-bulk');
  res.json({ ok: true });
});

app.post('/api/test-users/purge', async (req, res) => {
  const sandboxId = String(req.body?.sandboxId || '').trim();
  const userId = String(req.body?.userId || '').trim();
  if (!sandboxId) return res.status(400).json({ error: 'sandbox-id-required' });
  await purgeSandboxData(sandboxId);
  queueDatabaseBackup('test-user-purge', { force: true });
  return res.json({ ok: true, sandboxId, userId });
});

app.get('/api/storage', async (_req, res) => {
  const data = await computeStorageUsage();
  res.json(data);
});

app.get('/api/backups', async (_req, res) => {
  const backups = await listBackupNames();
  res.json({ backups });
});

app.delete('/api/backups/:fileName', async (req, res) => {
  const raw = req.params?.fileName || '';
  const fileName = decodeURIComponent(raw);
  if (!fileName) return res.status(400).json({ error: 'file-required' });
  try {
    await deleteBackupFileName(fileName);
    await trimOldBackups();
    const backups = await listBackupNames();
    const storage = await computeStorageUsage();
    return res.json({ ok: true, backups, storage });
  } catch (error) {
    return res.status(400).json({ error: 'delete-failed', message: String(error?.message || error) });
  }
});

app.post('/api/backups/prune-older', async (req, res) => {
  const days = Number(req.body?.days || 0);
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: 'invalid-days' });
  await pruneBackups({ keepLatest: MAX_DB_BACKUPS, maxAgeDays: days, hardCapBytes: MAX_BACKUP_TOTAL_BYTES, compressOld: COMPRESS_OLD_BACKUPS });
  const backups = await listBackupNames();
  const storage = await computeStorageUsage();
  return res.json({ ok: true, backups, storage });
});

app.post('/api/backups/keep-latest', async (req, res) => {
  const count = Number(req.body?.count || 0);
  if (!Number.isFinite(count) || count < 1) return res.status(400).json({ error: 'invalid-count' });
  await pruneBackups({ keepLatest: count, maxAgeDays: null, hardCapBytes: MAX_BACKUP_TOTAL_BYTES, compressOld: COMPRESS_OLD_BACKUPS });
  const backups = await listBackupNames();
  const storage = await computeStorageUsage();
  return res.json({ ok: true, backups, storage });
});

app.post('/api/backups/restore', async (req, res) => {
  const fileName = req.body?.fileName || '';
  if (!fileName) return res.status(400).json({ error: 'file-required' });
  try {
    await restoreFromBackupFileName(fileName);
    queueDatabaseBackup('manual-restore', { force: true });
    return res.json({ ok: true, fileName });
  } catch (error) {
    return res.status(400).json({ error: 'restore-failed', message: String(error?.message || error) });
  }
});

setInterval(() => {
  queueDatabaseBackup('interval-autosave');
}, Math.max(5 * 60 * 1000, AUTO_BACKUP_INTERVAL_MS));

app.post('/api/v1/auth/login', async (req, res) => {
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  const password = req.body?.password || '';
  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier-password-required' });
  }

  const userResult = await query(
    `select id, email, username, full_name, password_hash, status
     from users
     where lower(email) = lower($1) or lower(username) = lower($1)
     limit 1`,
    [identifier],
  );
  if (!userResult.rowCount) return res.status(401).json({ error: 'invalid-credentials' });

  const user = userResult.rows[0];
  if (user.status !== 'active') return res.status(403).json({ error: 'user-inactive' });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'invalid-credentials' });

  const { roles, permissions } = buildSingleTenantClaims(user);
  const token = signAuthToken({ userId: user.id, roles, permissions });

  await query(`update users set last_login_at = now(), updated_at = now() where id = $1`, [user.id]);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      roles,
      permissions,
    },
  });
});

app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  res.json({
    userId: req.auth.userId,
    roles: req.auth.roles,
    permissions: req.auth.permissions,
  });
});

app.get(
  '/api/v1/settings',
  requireAuth,
  requirePermission('*'),
  (_req, res) => {
    // TODO: read app settings from database
    res.json({ data: {} });
  },
);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend scaffold listening on :${env.PORT}`);
});
