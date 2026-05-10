import express from 'express';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { env } from './config/env.js';
import { query, withTransaction } from './db/adapter.js';
import { requireAuth } from './middleware/requireAuth.js';
import { resolveTenant, requirePermission } from './middleware/resolveTenant.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-apg-process-token, X-APG-Process-Token',
  );
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

function normalizeHost(rawHost) {
  return (rawHost || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
}

function tokenHash(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function parseBranchIds(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.filter(Boolean);
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function resolveTenantIdForLogin(req, identifier) {
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const domainResult = await query(
      `select tenant_id
       from tenant_domains
       where lower(host) = $1
       limit 1`,
      [host],
    );
    if (domainResult.rowCount) return domainResult.rows[0].tenant_id;
  }

  const providedTenantSlug = (req.body?.tenantSlug || '').trim().toLowerCase();
  if (providedTenantSlug) {
    const tenantResult = await query(`select id from tenants where lower(slug) = $1 limit 1`, [
      providedTenantSlug,
    ]);
    if (tenantResult.rowCount) return tenantResult.rows[0].id;
  }

  const singleTenantResult = await query(
    `select tenant_id
     from users
     where lower(email) = lower($1) or lower(username) = lower($1)
     group by tenant_id
     limit 2`,
    [identifier],
  );
  if (singleTenantResult.rowCount === 1) return singleTenantResult.rows[0].tenant_id;

  return null;
}

async function loadUserClaims(userId, executor = query) {
  const rolesResult = await executor(
    `select distinct r.name
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1`,
    [userId],
  );
  const permissionsResult = await executor(
    `select distinct p.code
     from user_roles ur
     join role_permissions rp on rp.role_id = ur.role_id
     join permissions p on p.id = rp.permission_id
     where ur.user_id = $1`,
    [userId],
  );

  return {
    roles: rolesResult.rows.map((row) => row.name),
    permissions: permissionsResult.rows.map((row) => row.code),
  };
}

function signAuthToken({ tenantId, userId, roles, permissions }) {
  return jwt.sign({ tenantId, userId, roles, permissions }, env.JWT_SECRET, {
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

app.get('/api/members', async (_req, res) => {
  const members = await readJsonCollection('apg.members', []);
  res.json(members);
});

app.put('/api/members/bulk', async (req, res) => {
  await writeJsonCollection('apg.members', req.body?.members || []);
  queueDatabaseBackup('members-bulk');
  res.json({ ok: true });
});

app.get('/api/visitors', async (_req, res) => {
  const visitors = await readJsonCollection('apg.visitors', []);
  res.json(visitors);
});

app.put('/api/visitors/bulk', async (req, res) => {
  await writeJsonCollection('apg.visitors', req.body?.visitors || []);
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

app.get('/api/settings', async (_req, res) => {
  const settings = await readJsonValue('apg.settings', null);
  res.json(settings || {});
});

app.put('/api/settings/bulk', async (req, res) => {
  await writeJsonValue('apg.settings', req.body?.settings || {});
  queueDatabaseBackup('settings-bulk');
  res.json({ ok: true });
});

app.get('/api/logs', async (_req, res) => {
  const logs = await readJsonCollection('apg.logs', []);
  res.json(logs);
});

app.put('/api/logs/bulk', async (req, res) => {
  await writeJsonCollection('apg.logs', req.body?.logs || []);
  queueDatabaseBackup('logs-bulk');
  res.json({ ok: true });
});

app.get('/api/finance', async (_req, res) => {
  const finance = await readJsonCollection('apg.finance', []);
  res.json(finance);
});

app.put('/api/finance/bulk', async (req, res) => {
  await writeJsonCollection('apg.finance', req.body?.finance || []);
  queueDatabaseBackup('finance-bulk');
  res.json({ ok: true });
});

app.get('/api/sms-events', async (_req, res) => {
  const events = await readJsonCollection('apg.sms.events', []);
  res.json(events);
});

app.put('/api/sms-events/bulk', async (req, res) => {
  await writeJsonCollection('apg.sms.events', req.body?.smsEvents || []);
  queueDatabaseBackup('sms-events-bulk');
  res.json({ ok: true });
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

  const tenantId = await resolveTenantIdForLogin(req, identifier);
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant-unresolved', message: 'Provide tenantSlug or valid host' });
  }

  const userResult = await query(
    `select id, tenant_id, email, username, full_name, password_hash, status
     from users
     where tenant_id = $1
       and (lower(email) = lower($2) or lower(username) = lower($2))
     limit 1`,
    [tenantId, identifier],
  );
  if (!userResult.rowCount) return res.status(401).json({ error: 'invalid-credentials' });

  const user = userResult.rows[0];
  if (user.status !== 'active') return res.status(403).json({ error: 'user-inactive' });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'invalid-credentials' });

  const { roles, permissions } = await loadUserClaims(user.id);
  const token = signAuthToken({ tenantId: user.tenant_id, userId: user.id, roles, permissions });

  await query(`update users set last_login_at = now(), updated_at = now() where id = $1`, [user.id]);

  return res.json({
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      roles,
      permissions,
    },
  });
});

app.get('/api/v1/auth/me', requireAuth, resolveTenant, (req, res) => {
  res.json({
    tenantId: req.tenant.id,
    userId: req.auth.userId,
    roles: req.auth.roles,
    permissions: req.auth.permissions,
  });
});

app.get(
  '/api/v1/settings',
  requireAuth,
  resolveTenant,
  requirePermission('settings.managePlans'),
  (_req, res) => {
    // TODO: read tenant_settings from database
    res.json({ data: {} });
  },
);

app.post('/api/v1/invites/accept', async (req, res) => {
  const rawToken = (req.body?.token || '').trim();
  const password = req.body?.password || '';
  const fullName = (req.body?.fullName || '').trim();

  if (!rawToken || !password) {
    return res.status(400).json({ error: 'token-password-required' });
  }

  const hashedInviteToken = tokenHash(rawToken);

  const accepted = await withTransaction(async (client) => {
    const inviteResult = await client.query(
      `select id, tenant_id, email, role_id, branch_ids, expires_at, accepted_at
       from invites
       where token_hash = $1
       limit 1`,
      [hashedInviteToken],
    );
    if (!inviteResult.rowCount) return { error: 'invalid-invite', status: 400 };

    const invite = inviteResult.rows[0];
    if (invite.accepted_at) return { error: 'invite-already-accepted', status: 409 };
    if (new Date(invite.expires_at).getTime() < Date.now()) return { error: 'invite-expired', status: 400 };

    const passwordHash = await bcrypt.hash(password, 12);
    const existingUserResult = await client.query(
      `select id, username
       from users
       where tenant_id = $1 and lower(email) = lower($2)
       limit 1`,
      [invite.tenant_id, invite.email],
    );

    let userId;
    if (existingUserResult.rowCount) {
      userId = existingUserResult.rows[0].id;
      await client.query(
        `update users
         set password_hash = $1,
             full_name = coalesce(nullif($2, ''), full_name),
             status = 'active',
             blocked_reason = null,
             updated_at = now()
         where id = $3`,
        [passwordHash, fullName, userId],
      );
    } else {
      const usernameBase = invite.email.split('@')[0].replace(/[^a-z0-9_.-]/gi, '').toLowerCase() || 'user';
      const username = `${usernameBase}_${Math.floor(1000 + Math.random() * 9000)}`;
      const insertedUser = await client.query(
        `insert into users (tenant_id, email, username, password_hash, full_name, status)
         values ($1, $2, $3, $4, $5, 'active')
         returning id`,
        [invite.tenant_id, invite.email, username, passwordHash, fullName || invite.email],
      );
      userId = insertedUser.rows[0].id;
    }

    await client.query(
      `insert into user_roles (user_id, role_id)
       values ($1, $2)
       on conflict (user_id, role_id) do nothing`,
      [userId, invite.role_id],
    );

    const branchIds = parseBranchIds(invite.branch_ids);
    for (const branchId of branchIds) {
      await client.query(
        `insert into user_branches (user_id, branch_id)
         values ($1, $2)
         on conflict (user_id, branch_id) do nothing`,
        [userId, branchId],
      );
    }

    await client.query(`update invites set accepted_at = now() where id = $1`, [invite.id]);

    const userResult = await client.query(
      `select id, tenant_id, email, username, full_name
       from users
       where id = $1`,
      [userId],
    );
    const user = userResult.rows[0];
    const claims = await loadUserClaims(user.id, (text, params) => client.query(text, params));
    const token = signAuthToken({
      tenantId: user.tenant_id,
      userId: user.id,
      roles: claims.roles,
      permissions: claims.permissions,
    });

    return {
      token,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        roles: claims.roles,
        permissions: claims.permissions,
      },
    };
  });

  if (accepted.error) {
    return res.status(accepted.status).json({ error: accepted.error });
  }
  return res.json(accepted);
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend scaffold listening on :${env.PORT}`);
});
