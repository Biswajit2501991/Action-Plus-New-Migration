import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { assertSecurityEnvAtStartup } from './config/validateSecurityEnv.js';
import { isOriginAllowed } from './config/cors.js';
import { query } from './db/adapter.js';
import { membersTableName } from './db/tables.js';
import { membersBulkUpsertReady } from './db/supabase/membersWrite.js';
import { visitorsHaveGymCodeColumn } from './db/supabase/visitorsSchema.js';
import { memberPhotosStorageReady } from './services/memberPhoto/memberPhotoSchema.js';
import { memberPhotoStorageEnabled } from './services/memberPhoto/storageConstants.js';
import {
  findOverlappingPendingLeave,
  insertLeaveRequest,
  updateLeaveRequestByExternalId,
  deleteLeaveRequestsForUserIds,
  leaveDaysFromDateRange,
} from './db/supabase/leaveRequestsWrite.js';
import { T } from './db/tables.js';
import {
  dataBackendLabel,
  pingDataStore,
  purgeSandboxData,
  readJsonCollection,
  readJsonValue,
  useSupabase,
  writeJsonCollection,
  writeJsonValue,
  punchStaffAttendance,
  upsertStaffAttendanceRecords,
  readStaffAttendanceInRange,
  deleteAttendanceRecordsInRange,
  readWhatsappTemplates,
  writeWhatsappTemplate,
  appendAuditLogEntry,
  deleteLogsInRange,
  deleteLogsByIds,
  deleteStaffUsers,
  addSettingsLookup,
  deleteSettingsLookup,
  deleteMemberPayment,
  deleteMember,
  overrideMemberPaidForMonthAmount,
  deleteVisitor,
  writeRoleTemplates,
  patchPtClientProfileValue,
} from './db/dataStore.js';
import { addSseClient, sseClientCount } from './realtime/hub.js';
import {
  realtimeListenerStatus,
  startSupabaseRealtimeListener,
} from './realtime/supabaseListener.js';
import { requireApiAuth } from './middleware/requireApiAuth.js';
import { syncStaffBranchScope } from './middleware/syncStaffBranchScope.js';
import {
  resolveReadBranchScope,
  filterRowsForStaffWrite,
  assertStaffHasBranchForWrite,
  staffBranchBlocksAllRows,
  filterAttendanceRecordsForBranchScope,
} from './auth/branchScope.js';
import { bindGymContext } from './middleware/bindGymContext.js';
import { requireMasterOwner, requireMasterOwnerUnlessProcessControl } from './middleware/requireMasterOwner.js';
import { requireMemberPermanentDelete } from './middleware/requireMemberDelete.js';
import { isOwnerAuth } from './middleware/requireOwner.js';
import { requireBranchAdmin } from './middleware/requireBranchAdmin.js';
import { requireStaffManagementRead, requireStaffManagementWrite } from './middleware/requireStaffManagement.js';
import { filterUsersForAuth, sanitizeUsersBulkForAuth } from './auth/tenant/userScope.js';
import { LOOKUP_CREATED_BY } from './auth/tenant/roles.js';
import { authIsBranchOwner, authIsMasterOwner, authUsesGlobalDataRead } from './auth/tenant/scopedAuth.js';
import { Access, getStaffAccessForUser } from './auth/accessControl.js';
import { canReadSettingsScope } from './db/supabase/settingsBranchFilter.js';
import { normalizeSettingsScope } from './db/supabase/settingsScope.js';
import { requireAccess, requireLogsBulkAccess } from './middleware/permissions.js';
import authRouter from './routes/auth.js';
import gymCodesRouter from './routes/gymCodes.js';
import brandingRouter from './routes/branding.js';
import memberPhotosRouter from './routes/memberPhotos.js';
import {
  authIsOwner,
  stampBranchOnRows,
  assertBranchWriteAllowed,
  loadBranchScope,
  logMatchesBranchScope,
} from './auth/branchFilter.js';
import { getSupabase, gymId } from './db/supabase/client.js';
import { resolvePtClientMemberId } from './utils/ptClientMemberId.js';

import { isLoopbackRequest } from './middleware/isLoopbackRequest.js';
import { apiFeatures, buildInfo, versionPayload } from './buildInfo.js';

assertSecurityEnvAtStartup();

const app = express();
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.set('trust proxy', true);

function requireSettingsLookupAdd(req, res, next) {
  return requireAccess(Access.settingsRead)(req, res, next);
}

function requireSettingsLookupDelete(req, res, next) {
  return requireAccess(Access.settingsRead)(req, res, next);
}

function stripUsersForApi(users) {
  if (!Array.isArray(users)) return [];
  return users.map((u) => {
    if (!u || typeof u !== 'object') return u;
    const { password, ...safe } = u;
    return safe;
  });
}
// Member bulk PUT includes base64 photos; 1mb was dropping saves silently (413).
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, env.CORS_ALLOWED_ORIGINS)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-apg-process-token, X-APG-Process-Token, x-apg-user-id, x-apg-sandbox-id, x-apg-test-profile, x-apg-legacy-auth, X-APG-Legacy-Auth',
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

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

function readSandboxScope(req) {
  const testProfile = String(req.headers['x-apg-test-profile'] || '').trim() === '1';
  const sandboxId = String(req.headers['x-apg-sandbox-id'] || '').trim();
  const userId = String(req.headers['x-apg-user-id'] || '').trim();
  if (!testProfile || !sandboxId) return null;
  return { sandboxId, userId };
}

async function readScopedCollection(req, key, fallback = []) {
  const scope = readSandboxScope(req);
  return readJsonCollection(key, fallback, scope);
}

/**
 * Phase 2 zero-leak read: members/visitors are filtered at the SQL layer using the
 * staff JWT's gym_code_id. Owners (no branchScope) see everything; staff get a Set
 * scoped to their own branch_id, never seeing rows from other branches OR untagged
 * legacy rows.
 */
function buildBranchScope(req) {
  return resolveReadBranchScope(req.auth);
}

async function readBranchScopedCollection(req, key, fallback = []) {
  const scope = readSandboxScope(req);
  const branchScope = buildBranchScope(req);
  return readJsonCollection(key, fallback, scope, branchScope);
}

async function writeScopedCollection(req, key, incomingRows = []) {
  const scope = readSandboxScope(req);
  await writeJsonCollection(key, incomingRows, scope);
}

async function readScopedSettings(req) {
  const scope = readSandboxScope(req);
  return readJsonValue('apg.settings', {}, scope);
}

async function writeScopedSettings(req, value) {
  const scope = readSandboxScope(req);
  await writeJsonValue('apg.settings', value || {}, scope);
}

/**
 * Normalize a {startDate, endDate} pair coming from a date-range cleanup
 * request into both a calendar-day pair (YYYY-MM-DD) for display/audit AND a
 * millisecond pair for filtering. Returns null when either input is missing
 * or unparseable so the caller can 400 the request.
 */
function normalizeDateRange(rawStart, rawEnd) {
  const rawS = String(rawStart || '').trim();
  const rawE = String(rawEnd || '').trim();
  if (!rawS || !rawE) return null;
  const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startDate = isDateOnly(rawS) ? rawS : rawS.slice(0, 10);
  const endDate = isDateOnly(rawE) ? rawE : rawE.slice(0, 10);
  if (!isDateOnly(startDate) || !isDateOnly(endDate)) return null;
  if (startDate > endDate) return null;
  const startMs = isDateOnly(rawS)
    ? Date.parse(`${rawS}T00:00:00.000Z`)
    : Date.parse(rawS);
  const endMs = isDateOnly(rawE)
    ? Date.parse(`${rawE}T23:59:59.999Z`)
    : Date.parse(rawE);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startDate, endDate, startMs, endMs };
}

/**
 * Best-effort single-row audit log append. Uses the surgical
 * appendAuditLogEntry helper (single INSERT on Supabase, single in-place
 * append on sqlite) so destructive owner actions cost milliseconds, not the
 * seconds the legacy collection round-trip would have cost.
 */
async function appendAuditLog(req, { action, entityType = '', entityId = '', before = null, after = null }) {
  try {
    const actorId = String(req.auth?.userId || 'system').trim() || 'system';
    const entry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      actor: actorId,
      action: String(action || '').trim(),
      entityType: String(entityType || ''),
      entityId: String(entityId || ''),
      before: before == null ? null : before,
      after: after == null ? null : after,
    };
    await appendAuditLogEntry(readSandboxScope(req), entry);
  } catch (err) {
    console.error('[apg] appendAuditLog failed', err?.message || err);
  }
}

async function healthPayload(extra = {}) {
  return {
    service: 'gym-backend',
    ...buildInfo,
    features: apiFeatures,
    env: env.NODE_ENV,
    configuredGymId: env.APG_GYM_ID || null,
    dataBackend: dataBackendLabel(),
    membersTable: useSupabase() ? membersTableName : null,
    membersBulkUpsert: useSupabase() ? await membersBulkUpsertReady() : null,
    visitorsGymCodeColumn: useSupabase() ? await visitorsHaveGymCodeColumn(getSupabase()) : null,
    memberPhotoStorageEnabled: memberPhotoStorageEnabled(),
    memberPhotoStorageReady: useSupabase() ? await memberPhotosStorageReady(getSupabase()) : null,
    realtime: useSupabase() ? { ...realtimeListenerStatus(), sseClients: sseClientCount() } : null,
    ...extra,
  };
}

app.get('/api/v1/health', async (_req, res) => {
  try {
    await pingDataStore();
    res.json({ ok: true, ...(await healthPayload()) });
  } catch (error) {
    res.status(503).json({ ok: false, ...(await healthPayload({ error: String(error?.message || error) })) });
  }
});
app.get('/api/health', async (_req, res) => {
  try {
    await pingDataStore();
    res.json({ ok: true, ...(await healthPayload()) });
  } catch (error) {
    res.status(503).json({ ok: false, ...(await healthPayload({ error: String(error?.message || error) })) });
  }
});

app.get('/api/v1/version', (_req, res) => {
  res.json({ ok: true, ...versionPayload() });
});
app.get('/api/version', (_req, res) => {
  res.json({ ok: true, ...versionPayload() });
});

app.use('/api/auth', authRouter);

app.use('/api', requireApiAuth);
app.use('/api', syncStaffBranchScope);
app.use('/api', bindGymContext);

// Phase 2 gym-codes feature: list is authenticated-only, write is owner-only (inside the router).
app.use('/api/gym-codes', gymCodesRouter);
app.use('/api/branding', brandingRouter);

app.get('/api/realtime/stream', (req, res) => {
  if (!useSupabase()) {
    return res.status(404).json({ error: 'realtime-unavailable', message: 'Realtime requires DATA_BACKEND=supabase' });
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(`data: ${JSON.stringify({ collection: 'connected', at: Date.now() })}\n\n`);
  addSseClient(res);
  req.on('close', () => res.end());
});

function allowProcessControl(req, res) {
  if (!env.PROCESS_CONTROL_ENABLED) {
    return res.status(403).json({
      error: 'process-control-disabled',
      message: 'Backend process control is disabled. Set PROCESS_CONTROL_ENABLED=true to allow restart/stop/start.',
    });
  }
  if (env.NODE_ENV === 'production' && !isLoopbackRequest(req)) {
    return res.status(403).json({
      error: 'process-control-forbidden',
      message: 'Process control API is not available on the public network. Use the local supervisor instead.',
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

app.post('/api/process/stop', requireMasterOwnerUnlessProcessControl, (req, res) => {
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

app.post('/api/process/restart', requireMasterOwnerUnlessProcessControl, (req, res) => {
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

app.post('/api/process/start', requireMasterOwnerUnlessProcessControl, (req, res) => {
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

app.get('/api/members', requireAccess(Access.membersRead), async (req, res) => {
  // Phase 2 zero-leak: branch filter pushed into Supabase SQL via buildBranchScope.
  // Default view=list skips child tables + heavy columns to cut Supabase egress.
  const view = String(req.query?.view || 'list').trim().toLowerCase();
  const updatedSince = String(req.query?.updatedSince || '').trim();
  const scope = readSandboxScope(req);
  const branchScope = buildBranchScope(req);
  const options = view === 'full' ? { view: 'full' } : { view: 'list' };
  if (updatedSince) options.updatedSince = updatedSince;
  const members = await readJsonCollection('apg.members', [], scope, branchScope, options);
  res.json(members);
});

app.use('/api/members', memberPhotosRouter);

app.get('/api/members/:memberId', requireAccess(Access.membersRead), async (req, res) => {
  const memberCode = decodeURIComponent(String(req.params.memberId || '').trim());
  if (!memberCode) return res.status(400).json({ error: 'member-code-required' });
  const branchScope = buildBranchScope(req);
  try {
    const { readMember } = await import('./db/dataStore.js');
    const member = await readMember(memberCode, branchScope);
    if (!member) return res.status(404).json({ error: 'member-not-found' });
    return res.json(member);
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.message || 'member-read-failed',
    });
  }
});

app.put('/api/members/bulk', requireAccess(Access.membersWrite), async (req, res) => {
  const raw = Array.isArray(req.body?.members) ? req.body.members : [];
  const deletedMemberIds = Array.isArray(req.body?.deletedMemberIds)
    ? req.body.deletedMemberIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  try {
    assertStaffHasBranchForWrite(req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  const branchScope = buildBranchScope(req);
  const deletedSet = new Set(deletedMemberIds);
  if (deletedMemberIds.length) {
    const { authIsBranchOwner, authIsMasterOwner } = await import('./auth/tenant/scopedAuth.js');
    const { engineCanMasterPlatformOps } = await import('./auth/tenant/scopedAuthorizationEngine.js');
    const canPermanentDelete = engineCanMasterPlatformOps(req.auth)
      || authIsMasterOwner(req.auth)
      || authIsBranchOwner(req.auth)
      || isOwnerAuth(req.auth);
    if (!canPermanentDelete) {
      return res.status(403).json({ error: 'member-delete-forbidden' });
    }
    for (const memberCode of deletedMemberIds) {
      try {
        await deleteMember(memberCode, branchScope);
      } catch (err) {
        if (err?.status !== 404) {
          return res.status(err?.status || 500).json({
            error: err?.message || 'member-delete-failed',
            memberCode,
          });
        }
      }
    }
  }
  const rawWithoutDeleted = raw.filter((m) => !deletedSet.has(String(m?.memberId || '').trim()));
  const incoming = filterRowsForStaffWrite(rawWithoutDeleted, req.auth);
  try {
    assertBranchWriteAllowed(incoming, req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  // Defense-in-depth: prevent non-owner callers from quietly stripping payment
  // entries out of the snapshot. Slim bulk sync omits paymentHistory; guard only
  // runs when paymentHistory is present in the payload (pending member sync).
  try {
    if (!authIsOwner(req.auth)) {
      const { assertStaffPaymentDeletesAllowed } = await import('./db/dataStore.js');
      await assertStaffPaymentDeletesAllowed(incoming, buildBranchScope(req));
    }
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  // Owner without explicit selection => stamped HQ via their JWT gymCodeId;
  // staff => stamped from their JWT gymCodeId; safe no-op for already-tagged rows.
  const stamped = stampBranchOnRows(incoming, req.auth);
  await writeScopedCollection(req, 'apg.members', stamped);
  queueDatabaseBackup('members-bulk');
  res.json({ ok: true });
});

/**
 * Surgical single-member mutation. Replaces the bulk-PUT fan-out for everyday edits
 * (especially gym-code reassignment) which used to timeout against Supabase.
 * Body: { patch: { ...partial app-member fields }, expectedAssignedGymCodeId?: string }
 */
app.patch('/api/members/:memberId', requireAccess(Access.membersWrite), async (req, res) => {
  const memberCode = String(req.params.memberId || '').trim();
  const patch = req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : null;
  if (!memberCode) return res.status(400).json({ error: 'member-code-required' });
  if (!patch) return res.status(400).json({ error: 'patch-required' });
  const branchScope = buildBranchScope(req);
  try {
    const { updateMember } = await import('./db/dataStore.js');
    const updated = await updateMember(memberCode, patch, branchScope);
    queueDatabaseBackup('members-patch');
    return res.json({ ok: true, member: updated });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'member-patch-failed',
      detail: err?.detail || null,
    });
  }
});

/**
 * Owner-only surgical payment delete. Persists to member_payment_history immediately
 * (no debounced full-members bulk). Returns 404 when the row is not found after DB sync.
 */
async function handlePermanentMemberDelete(req, res, memberCode) {
  const code = String(memberCode || '').trim();
  if (!code) {
    return res.status(400).json({ error: 'member-code-required', deleted: false });
  }
  try {
    assertStaffHasBranchForWrite(req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  const branchScope = buildBranchScope(req);
  try {
    const result = await deleteMember(code, branchScope);
    await appendAuditLog(req, {
      action: 'member.deleted',
      entityType: 'member',
      entityId: code,
      after: { memberId: code, deleted: true },
    });
    queueDatabaseBackup('member-delete');
    return res.json(result);
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'member-delete-failed',
      deleted: false,
      detail: err?.detail || null,
    });
  }
}

/** Body JSON avoids member codes with "/" breaking path-based DELETE behind proxies. */
app.post('/api/members/permanent-delete', requireMemberPermanentDelete, async (req, res) => {
  const memberCode = String(req.body?.memberId || req.body?.memberCode || '').trim();
  return handlePermanentMemberDelete(req, res, memberCode);
});

app.delete('/api/members/:memberId', requireMemberPermanentDelete, async (req, res) => {
  const memberCode = decodeURIComponent(String(req.params.memberId || '').trim());
  return handlePermanentMemberDelete(req, res, memberCode);
});

app.patch('/api/members/:memberId/paid-for-month/:monthKey', requireAccess(Access.membersWrite), async (req, res) => {
  const memberCode = String(req.params.memberId || '').trim();
  const monthKey = decodeURIComponent(String(req.params.monthKey || '').trim());
  const newAmount = Number(req.body?.amount);
  if (!memberCode || !monthKey) {
    return res.status(400).json({ error: 'member-code-and-month-required' });
  }
  const branchScope = buildBranchScope(req);
  try {
    const result = await overrideMemberPaidForMonthAmount(
      memberCode,
      monthKey,
      newAmount,
      branchScope,
      {
        changedBy: req.auth?.name || req.auth?.userId || '',
        overrideReason: req.body?.overrideReason || null,
        confirmOverride: Boolean(req.body?.confirmOverride),
      },
    );
    if (result.changed) {
      await appendAuditLog(req, {
        action: 'member.paid_for_month.amount_overridden',
        entityType: 'member',
        entityId: memberCode,
        before: { paidForMonth: monthKey, amount: result.oldAmount },
        after: { paidForMonth: monthKey, amount: result.newAmount },
      });
    }
    queueDatabaseBackup('paid-for-month-override');
    return res.json(result);
  } catch (err) {
    const status = err?.status || 500;
    const detail = err?.detail && typeof err.detail === 'object' ? err.detail : {};
    return res.status(status).json({
      error: err?.message || 'paid-for-month-override-failed',
      ...detail,
    });
  }
});

app.delete('/api/members/:memberId/payments/:paymentId', requireMasterOwner, async (req, res) => {
  const memberCode = String(req.params.memberId || '').trim();
  const paymentId = decodeURIComponent(String(req.params.paymentId || '').trim());
  if (!memberCode || !paymentId) {
    return res.status(400).json({ error: 'member-code-and-payment-id-required', deleted: false });
  }
  const branchScope = buildBranchScope(req);
  try {
    const result = await deleteMemberPayment(memberCode, paymentId, branchScope);
    await appendAuditLog(req, {
      action: 'member.payment.deleted',
      entityType: 'member',
      entityId: memberCode,
      after: { paymentId, deleted: true },
    });
    queueDatabaseBackup('member-payment-delete');
    return res.status(200).json(result);
  } catch (err) {
    const status = err?.status || 500;
    const deleted = status === 404 ? false : undefined;
    return res.status(status).json({
      error: err?.message || 'payment-delete-failed',
      deleted: deleted ?? false,
      detail: err?.detail || null,
    });
  }
});

app.get('/api/visitors', requireAccess(Access.visitorsRead), async (req, res) => {
  const visitors = await readBranchScopedCollection(req, 'apg.visitors', []);
  res.json(visitors);
});

app.put('/api/visitors/bulk', requireAccess(Access.visitorsWrite), async (req, res) => {
  const raw = Array.isArray(req.body?.visitors) ? req.body.visitors : [];
  try {
    assertStaffHasBranchForWrite(req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  const incoming = filterRowsForStaffWrite(raw, req.auth);
  try {
    assertBranchWriteAllowed(incoming, req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  const stamped = stampBranchOnRows(incoming, req.auth);
  await writeScopedCollection(req, 'apg.visitors', stamped);
  queueDatabaseBackup('visitors-bulk');
  res.json({ ok: true });
});

app.delete('/api/visitors/:visitorId', requireAccess(Access.visitorsDelete), async (req, res) => {
  const visitorId = String(req.params?.visitorId || '').trim();
  if (!visitorId) {
    return res.status(400).json({ error: 'visitor-id-required' });
  }
  try {
    assertStaffHasBranchForWrite(req.auth);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: err.message,
      detail: err.detail || null,
    });
  }
  try {
    const branchScope = buildBranchScope(req);
    const result = await deleteVisitor(visitorId, branchScope);
    await appendAuditLog(req, {
      action: 'visitor.deleted',
      entityType: 'visitor',
      entityId: visitorId,
      before: { id: visitorId },
      after: null,
    });
    queueDatabaseBackup('visitor-delete');
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'visitor-delete-failed',
      detail: err.detail || null,
    });
  }
});

app.get('/api/users', requireStaffManagementRead, async (req, res) => {
  const users = await readJsonCollection('apg.users', [], null);
  res.json(filterUsersForAuth(users, req.auth));
});

app.put('/api/users/bulk', requireStaffManagementWrite, async (req, res) => {
  try {
    const raw = stripUsersForApi(req.body?.users || []);
    const users = authIsMasterOwner(req.auth) ? raw : sanitizeUsersBulkForAuth(raw, req.auth);
    await writeJsonCollection('apg.users', users);
    queueDatabaseBackup('users-bulk');
    return res.json({ ok: true });
  } catch (error) {
    const message = String(error?.message || error);
    let errorCode = 'users-bulk-failed';
    if (/no unique or exclusion constraint/i.test(message)) {
      errorCode = 'staff-sync-constraint-missing';
    } else if (/staff_user_access sync failed|staff_user_sections sync failed/i.test(message)) {
      errorCode = 'staff-sync-constraint-missing';
    } else if (/staff_users_gym_id_staff_login_id_key|staff_login_id.*duplicate|duplicate.*staff_login/i.test(message)) {
      errorCode = 'staff-login-duplicate';
    }
    return res.status(500).json({
      error: errorCode,
      message,
    });
  }
});

// Owner-only focused staff bulk-delete. Refuses to remove protected seed
// owners (Bis, Raja), any user whose role is 'owner', or the requester
// themselves. Returns the lists of deleted + skipped ids so the UI can
// surface "n removed, k skipped because…" without re-reading the collection.
const PROTECTED_STAFF_IDS = new Set(['Bis', 'Raja', 'owner']);
app.post('/api/users/cleanup', requireStaffManagementWrite, async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const targets = new Set(
      incoming
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    );
    if (!targets.size) {
      return res.json({ ok: true, deleted: [], skipped: [], reason: 'no-ids' });
    }
    const requesterId = String(req.auth?.userId || '').trim();
    // Read the live staff list so protection rules (owner role, requester self,
    // seed ids) can be enforced before we touch persistent storage.
    const existing = await readJsonCollection('apg.users', [], null);
    const lookup = new Map();
    for (const user of existing) {
      const id = String(user?.id || '').trim();
      if (id) lookup.set(id, user);
    }
    const toDelete = [];
    const skipped = [];
    for (const id of targets) {
      const user = lookup.get(id);
      const isOwnerRow = user
        ? (String(user?.role || '').toLowerCase() === 'owner'
          || String(user?.staffRole || '').toLowerCase() === 'master_owner')
        : false;
      const isProtected = PROTECTED_STAFF_IDS.has(id) || isOwnerRow || (requesterId && id === requesterId);
      if (isProtected) {
        skipped.push({ id, reason: isOwnerRow ? 'owner_role' : (id === requesterId ? 'self' : 'seed_account') });
        continue;
      }
      if (!authIsMasterOwner(req.auth) && user) {
        try {
          const { assertBranchAdminManagesUser } = await import('./auth/tenant/userScope.js');
          assertBranchAdminManagesUser(req.auth, user);
        } catch (err) {
          skipped.push({ id, reason: err?.message || 'cross_branch' });
          continue;
        }
      }
      toDelete.push(id);
    }
    if (!toDelete.length) {
      return res.json({ ok: true, deleted: [], skipped });
    }
    // Destructive path: hits staff_users directly on Supabase. The legacy
    // writeJsonCollection('apg.users', kept) path is upsert-only by design,
    // which is why cleanup needs its own primitive.
    const { deleted, skipped: storeSkipped } = await deleteStaffUsers(readSandboxScope(req), toDelete);
    const mergedSkipped = [
      ...skipped,
      ...(Array.isArray(storeSkipped) ? storeSkipped.map((id) => ({ id: String(id), reason: 'not_found' })) : []),
    ];
    if (!deleted.length) {
      return res.json({ ok: true, deleted: [], skipped: mergedSkipped });
    }
    await appendAuditLog(req, {
      action: 'staff.bulk_deleted',
      entityType: 'user',
      entityId: deleted.join(','),
      after: { deleted, skipped: mergedSkipped },
    });
    queueDatabaseBackup('users-cleanup');
    return res.json({ ok: true, deleted, skipped: mergedSkipped });
  } catch (error) {
    return res.status(500).json({ error: 'users_cleanup_failed', message: String(error?.message || error) });
  }
});

app.get('/api/settings', requireAccess(Access.settingsRead), async (req, res) => {
  const settingsScope = normalizeSettingsScope(req.query?.scope);
  const scope = readSandboxScope(req);
  const { readSettingsDeduped } = await import('./services/settingsReadService.js');
  try {
    const staffAccess = req.staffAccess || await getStaffAccessForUser(req.auth?.userId);
    if (!canReadSettingsScope(req.auth, staffAccess, settingsScope)) {
      return res.status(403).json({
        error: 'settings_scope_forbidden',
        message: 'You do not have permission to read this settings scope.',
        scope: settingsScope,
      });
    }
    const settings = await readSettingsDeduped(scope, {
      scope: settingsScope,
      auth: req.auth || null,
      staffAccess,
    });
    return res.json(settings || {});
  } catch (error) {
    return res.status(500).json({
      error: 'settings-read-failed',
      message: String(error?.message || error),
      scope: settingsScope,
    });
  }
});

app.put('/api/settings/bulk', requireMasterOwner, async (req, res) => {
  await writeScopedSettings(req, req.body?.settings || {});
  queueDatabaseBackup('settings-bulk');
  res.json({ ok: true });
});

app.put('/api/settings/role-templates', requireMasterOwner, async (req, res) => {
  try {
    const roleTemplates = req.body?.roleTemplates;
    if (!Array.isArray(roleTemplates)) {
      return res.status(400).json({ error: 'role_templates_required', message: 'roleTemplates array is required' });
    }
    const saved = await writeRoleTemplates(readSandboxScope(req), roleTemplates);
    await appendAuditLog(req, {
      action: 'settings.role_templates.updated',
      entityType: 'settings',
      entityId: 'roleTemplates',
      after: { count: saved.length },
    });
    queueDatabaseBackup('settings-role-templates');
    return res.json({ ok: true, roleTemplates: saved });
  } catch (error) {
    return res.status(500).json({
      error: 'role_templates_save_failed',
      message: String(error?.message || error),
    });
  }
});

const SETTINGS_LOOKUP_KEYS = new Set([
  'plans',
  'statuses',
  'paymentMethods',
  'holdDurations',
  'genders',
  'expenseCategories',
  'exerciseTypes',
]);

app.post('/api/settings/lookups', requireSettingsLookupAdd, async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim();
    const value = String(req.body?.value || '').trim();
    if (!SETTINGS_LOOKUP_KEYS.has(category)) {
      return res.status(400).json({ error: 'invalid_category', message: 'Unknown lookup category' });
    }
    if (!value || value.length > 120) {
      return res.status(400).json({ error: 'invalid_value', message: 'Lookup value is required (max 120 chars)' });
    }
    const createdByRole = isOwnerAuth(req.auth) || authIsMasterOwner(req.auth)
      ? LOOKUP_CREATED_BY.MASTER_OWNER
      : (authIsBranchOwner(req.auth) ? LOOKUP_CREATED_BY.BRANCH_OWNER : LOOKUP_CREATED_BY.STAFF);
    const saved = await addSettingsLookup(readSandboxScope(req), {
      category,
      value,
      createdByRole,
      createdByStaffLoginId: req.auth?.userId || null,
      createdByGymCodeId: req.auth?.gymCodeId || null,
    });
    await appendAuditLog(req, {
      action: 'settings.lookup.added',
      entityType: 'settings_lookup',
      entityId: `${category}:${value}`,
      after: saved,
    });
    queueDatabaseBackup('settings-lookup-add');
    return res.json(saved);
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg === 'invalid_lookup_category' || msg === 'invalid_lookup_value') {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'settings_lookup_add_failed', message: msg });
  }
});

app.delete('/api/settings/lookups', requireSettingsLookupDelete, async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim();
    const value = String(req.body?.value || '').trim();
    if (!SETTINGS_LOOKUP_KEYS.has(category)) {
      return res.status(400).json({ error: 'invalid_category', message: 'Unknown lookup category' });
    }
    if (!value) {
      return res.status(400).json({ error: 'invalid_value', message: 'Lookup value is required' });
    }
    const requesterRole = isOwnerAuth(req.auth) || authIsMasterOwner(req.auth)
      ? LOOKUP_CREATED_BY.MASTER_OWNER
      : (authIsBranchOwner(req.auth) ? LOOKUP_CREATED_BY.BRANCH_OWNER : LOOKUP_CREATED_BY.STAFF);
    const result = await deleteSettingsLookup(readSandboxScope(req), {
      category,
      value,
      requesterRole,
      requesterStaffLoginId: req.auth?.userId || null,
      requesterGymCodeId: req.auth?.gymCodeId || null,
    });
    await appendAuditLog(req, {
      action: 'settings.lookup.removed',
      entityType: 'settings_lookup',
      entityId: `${category}:${value}`,
      before: { category, value },
      after: result,
    });
    queueDatabaseBackup('settings-lookup-delete');
    return res.json(result);
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg === 'invalid_lookup_category' || msg === 'invalid_lookup_value') {
      return res.status(400).json({ error: msg });
    }
    if (msg === 'lookup-delete-master-protected' || msg === 'lookup-delete-not-owned' || msg === 'lookup-delete-owner-protected') {
      return res.status(403).json({ error: msg });
    }
    return res.status(500).json({ error: 'settings_lookup_delete_failed', message: msg });
  }
});

// ----------------------------------------------------------------------------
// Branch-scoped WhatsApp templates — GET/PATCH per gym_code_id (multi-tenant).
// ----------------------------------------------------------------------------
app.get('/api/whatsapp-templates', requireAccess(Access.templatesRead), async (req, res) => {
  try {
    const {
      resolveEffectiveTemplateBranchId,
      getBranchWhatsappTemplates,
    } = await import('./services/branchWhatsappTemplates.js');
    const gymCodeId = await resolveEffectiveTemplateBranchId(
      req.auth,
      req.query?.gymCodeId || req.query?.gym_code_id,
    );
    const result = await getBranchWhatsappTemplates(gymCodeId);
    return res.json({
      ok: true,
      gymCodeId: result.gymCodeId,
      templates: result.templates || {},
      updatedAt: result.updatedAt || null,
    });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || 'whatsapp_templates_read_failed',
      message: String(error?.message || error),
    });
  }
});

app.patch('/api/whatsapp-templates/:key', requireAccess(Access.templatesWrite), async (req, res) => {
  try {
    const {
      resolveEffectiveTemplateBranchId,
      assertWhatsappTemplateWriteAllowed,
      assertValidTemplateKey,
    } = await import('./services/branchWhatsappTemplates.js');
    const key = assertValidTemplateKey(req.params?.key);
    const body = String(req.body?.body == null ? '' : req.body.body);
    if (body.length > 8000) {
      return res.status(413).json({ error: 'body_too_long', message: 'template body exceeds 8000 chars' });
    }
    const gymCodeId = await resolveEffectiveTemplateBranchId(
      req.auth,
      req.body?.gymCodeId || req.body?.gym_code_id,
    );
    if (!authIsOwner(req.auth)) {
      const access = req.staffAccess || await getStaffAccessForUser(req.auth?.userId);
      assertWhatsappTemplateWriteAllowed(req.auth, access);
    }
    const saved = await writeWhatsappTemplate(readSandboxScope(req), { key, body, gymCodeId });
    await appendAuditLog(req, {
      action: 'whatsapp.template.updated',
      entityType: 'whatsapp_template',
      entityId: `${gymCodeId}:${key}`,
      after: { key, gymCodeId, length: body.length, updatedAt: saved.updatedAt },
    });
    queueDatabaseBackup('whatsapp-template');
    return res.json({ ok: true, template: saved, gymCodeId });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || 'whatsapp_template_save_failed',
      message: String(error?.message || error),
    });
  }
});

// ----------------------------------------------------------------------------
// Leave Requests — dedicated mutation surface that bypasses the owner-only
// /api/settings/bulk route. The previous architecture forced staff settings
// writes through that route which 403'd for non-owners, so submitted leaves
// never made it to the database and the owner never received a notification.
//
// These routes write only to the `leaveRequests` key of the scoped settings
// document. They do not allow staff to mutate any other setting.
// ----------------------------------------------------------------------------

function leaveRequestIsOwnerCaller(req) {
  return authIsOwner(req?.auth);
}

function sanitizeLeaveRequestInput(body, callerIsOwner, callerUserId) {
  const safe = body && typeof body === 'object' ? body : {};
  const TYPES = new Set(['Casual', 'Sick', 'Emergency', 'Unpaid']);
  const requestedUserId = String(safe.userId || '').trim();
  // Staff can only submit leave for themselves. Owners can submit on behalf of
  // anyone (e.g. when retroactively logging a phone-in absence).
  const userId = callerIsOwner && requestedUserId ? requestedUserId : callerUserId;
  if (!userId) return { error: 'userId-required' };
  const startDate = String(safe.startDate || '').trim();
  const endDate = String(safe.endDate || '').trim();
  if (!startDate || !endDate) return { error: 'date-range-required' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: 'invalid-dates' };
  if (end < start) return { error: 'end-before-start' };
  const days = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  const type = TYPES.has(safe.type) ? safe.type : 'Casual';
  const reason = String(safe.reason || '').trim().slice(0, 500);
  return { userId, type, startDate, endDate, days, reason };
}

async function assertStaffLoginExistsForLeave(staffLoginId) {
  if (!useSupabase()) return true;
  const key = String(staffLoginId || '').trim();
  if (!key) return false;
  const sb = getSupabase();
  const { data, error } = await sb
    .from(T.staff_users)
    .select('id')
    .eq('gym_id', gymId())
    .ilike('staff_login_id', key)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

app.post('/api/leave-requests', async (req, res) => {
  try {
    const callerIsOwner = leaveRequestIsOwnerCaller(req);
    const callerUserId = String(req.auth?.userId || '').trim();
    if (!callerUserId) return res.status(401).json({ error: 'auth-required' });
    const parsed = sanitizeLeaveRequestInput(req.body, callerIsOwner, callerUserId);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    if (useSupabase()) {
      const staffOk = await assertStaffLoginExistsForLeave(parsed.userId);
      if (!staffOk) {
        return res.status(400).json({ error: 'invalid-userId', message: 'Staff user not found for this gym.' });
      }
      const overlap = await findOverlappingPendingLeave(parsed.userId, parsed.startDate, parsed.endDate);
      if (overlap) {
        return res.status(409).json({
          error: 'leave-overlap',
          message: 'You already applied leave for these dates.',
        });
      }
      const request = {
        id: randomUUID(),
        userId: parsed.userId,
        type: parsed.type,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        days: parsed.days,
        reason: parsed.reason,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        createdBy: callerUserId,
      };
      await insertLeaveRequest(request);
      queueDatabaseBackup('leave-request-create');
      return res.json({ ok: true, request });
    }

    const current = (await readScopedSettings(req)) || {};
    const existing = Array.isArray(current.leaveRequests) ? current.leaveRequests : [];
    const request = {
      id: randomUUID(),
      userId: parsed.userId,
      type: parsed.type,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      days: parsed.days,
      reason: parsed.reason,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      createdBy: callerUserId,
    };
    const next = { ...current, leaveRequests: [request, ...existing] };
    await writeScopedSettings(req, next);
    queueDatabaseBackup('leave-request-create');
    return res.json({ ok: true, request });
  } catch (error) {
    const message = String(error?.message || error);
    let errorCode = 'leave-request-create-failed';
    if (/no unique or exclusion constraint/i.test(message)) {
      errorCode = 'leave-sync-constraint-missing';
    }
    return res.status(500).json({ error: errorCode, message });
  }
});

app.patch('/api/leave-requests/:id', requireMasterOwner, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id-required' });
    const STATUSES = new Set(['Pending', 'Approved', 'Rejected']);
    const status = STATUSES.has(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'invalid-status' });
    const actionBy = String(req.auth?.userId || 'owner');
    const actionAt = new Date().toISOString();

    if (useSupabase()) {
      const row = await updateLeaveRequestByExternalId(id, { status, actionBy });
      if (!row) return res.status(404).json({ error: 'leave-request-not-found' });
      const request = { ...row, actionAt, actionBy, days: leaveDaysFromDateRange(row.startDate, row.endDate) };
      queueDatabaseBackup('leave-request-update');
      return res.json({ ok: true, request });
    }

    const current = (await readScopedSettings(req)) || {};
    const existing = Array.isArray(current.leaveRequests) ? current.leaveRequests : [];
    let updated = null;
    const nextList = existing.map((r) => {
      if (r?.id !== id) return r;
      updated = {
        ...r,
        status,
        actionAt,
        actionBy,
      };
      return updated;
    });
    if (!updated) return res.status(404).json({ error: 'leave-request-not-found' });

    const next = { ...current, leaveRequests: nextList };
    await writeScopedSettings(req, next);
    queueDatabaseBackup('leave-request-update');
    return res.json({ ok: true, request: updated });
  } catch (error) {
    return res.status(500).json({
      error: 'leave-request-update-failed',
      message: String(error?.message || error),
    });
  }
});

// Owner-only cleanup for E2E teardown: removes all leave requests created by
// the listed user IDs (typically e2e-staff-* test accounts). Returns the
// remaining count so tests can assert success deterministically.
app.post('/api/leave-requests/cleanup', requireMasterOwner, async (req, res) => {
  try {
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!userIds.length) return res.json({ ok: true, removed: 0, remaining: null });

    if (useSupabase()) {
      const { removed, remaining } = await deleteLeaveRequestsForUserIds(userIds);
      return res.json({ ok: true, removed, remaining });
    }

    const current = (await readScopedSettings(req)) || {};
    const existing = Array.isArray(current.leaveRequests) ? current.leaveRequests : [];
    const removeSet = new Set(userIds);
    const remaining = existing.filter((r) => !removeSet.has(String(r?.userId || '')) && !removeSet.has(String(r?.createdBy || '')));
    const removed = existing.length - remaining.length;
    const next = { ...current, leaveRequests: remaining };
    await writeScopedSettings(req, next);
    return res.json({ ok: true, removed, remaining: remaining.length });
  } catch (error) {
    return res.status(500).json({
      error: 'leave-request-cleanup-failed',
      message: String(error?.message || error),
    });
  }
});

// ----------------------------------------------------------------------------
// PT Client Profiles — dedicated mutation surface for staff trainers.
// Previously PT edits only reached Supabase via owner-only PUT /api/settings/bulk,
// so non-owner staff changes stayed in local React state and never synced.
// Writes one member profile at a time; data is gym-scoped and shared by all staff.
// Member codes may contain "/" — accept memberId in JSON body (preferred) or path suffix.
async function handlePatchPtClientProfile(req, res) {
  try {
    const memberId = resolvePtClientMemberId({
      bodyMemberId: req.body?.memberId,
      pathParam: req.params?.memberId,
      pathSuffix: req.params?.[0],
    });
    if (!memberId) return res.status(400).json({ error: 'member-id-required' });
    const profile = req.body?.profile;
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'profile-required' });
    }
    const mode = String(req.body?.mode || 'workout').trim().toLowerCase();
    const callerIsOwner = authIsOwner(req.auth);
    if (!callerIsOwner) {
      const access = req.staffAccess || await getStaffAccessForUser(req.auth?.userId);
      if (!access) {
        return res.status(403).json({ error: 'forbidden', message: 'Account not found or blocked.' });
      }
      if (mode === 'plan' && !Access.ptClientsWritePlan(access)) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to edit PT plans.' });
      }
      if (mode !== 'plan' && !Access.ptClientsWriteWorkout(access)) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to edit PT workouts.' });
      }
    }
    const branchScope = buildBranchScope(req);
    const { readMember } = await import('./db/dataStore.js');
    const memberRow = await readMember(memberId, branchScope);
    if (!memberRow) return res.status(404).json({ error: 'member-not-found' });
    const saved = await patchPtClientProfileValue(memberId, profile, {
      updatedBy: String(req.auth?.userId || '').trim(),
    });
    queueDatabaseBackup('pt-client-profile');
    return res.json({ ok: true, memberId, profile: saved });
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg === 'member_not_found') return res.status(404).json({ error: 'member-not-found' });
    return res.status(500).json({
      error: 'pt-client-profile-save-failed',
      message: msg,
    });
  }
}

app.patch('/api/pt-client-profiles', requireAccess(Access.ptClientsRead), handlePatchPtClientProfile);
app.patch(/^\/api\/pt-client-profiles\/(.+)$/, requireAccess(Access.ptClientsRead), (req, res) => {
  const suffix = req.params[0];
  req.params = { memberId: suffix };
  return handlePatchPtClientProfile(req, res);
});

app.get('/api/attendance/records', requireAccess((a) => a.attendance?.viewAttendance !== false), async (req, res) => {
  try {
    const startDate = String(req.query?.startDate || '').slice(0, 10);
    const endDate = String(req.query?.endDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({
        error: 'invalid_range',
        message: 'startDate and endDate query params required (YYYY-MM-DD)',
      });
    }
    if (startDate > endDate) {
      return res.status(400).json({
        error: 'invalid_range',
        message: 'startDate must be <= endDate',
      });
    }
    const records = await readStaffAttendanceInRange(readSandboxScope(req), { startDate, endDate });
    if (staffBranchBlocksAllRows(resolveReadBranchScope(req.auth))) return res.json([]);
    if (authUsesGlobalDataRead(req.auth)) return res.json(records);
    const scope = await loadBranchScope(getSupabase(), req.auth);
    return res.json(filterAttendanceRecordsForBranchScope(records, scope));
  } catch (error) {
    return res.status(500).json({
      error: 'attendance_read_failed',
      message: String(error?.message || error),
    });
  }
});

app.post('/api/attendance/punch', requireAccess(Access.attendancePunch), async (req, res) => {
  try {
    const punchType = String(req.body?.type || 'login').toLowerCase();
    if (punchType !== 'login' && punchType !== 'logout') {
      return res.status(400).json({ error: 'invalid_type', message: 'type must be login or logout' });
    }
    const record = await punchStaffAttendance(readSandboxScope(req), {
      userId: req.auth.userId,
      punchType,
      atIso: req.body?.at || new Date().toISOString(),
      timeZone: req.body?.timeZone || null,
      actorName: req.body?.actorName || req.auth.userId,
    });
    queueDatabaseBackup('attendance-punch');
    return res.json({ ok: true, record });
  } catch (error) {
    return res.status(500).json({ error: 'attendance_punch_failed', message: String(error?.message || error) });
  }
});

app.put('/api/attendance/records', requireAccess(Access.attendanceWrite), async (req, res) => {
  try {
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    const count = await upsertStaffAttendanceRecords(readSandboxScope(req), records);
    queueDatabaseBackup('attendance-records');
    return res.json({ ok: true, count });
  } catch (error) {
    return res.status(500).json({ error: 'attendance_write_failed', message: String(error?.message || error) });
  }
});

// Owner-only bulk delete of attendance rows whose attendance_date is inside
// [startDate, endDate] (inclusive, YYYY-MM-DD). Returns the deleted count and
// echoes the range so the UI can confirm.
app.post('/api/attendance/cleanup', requireMasterOwner, async (req, res) => {
  try {
    const startDate = String(req.body?.startDate || '').slice(0, 10);
    const endDate = String(req.body?.endDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'invalid_range', message: 'startDate/endDate must be YYYY-MM-DD' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'invalid_range', message: 'startDate must be <= endDate' });
    }
    const { deleted } = await deleteAttendanceRecordsInRange(readSandboxScope(req), { startDate, endDate });
    await appendAuditLog(req, {
      action: 'attendance.range.cleared',
      entityType: 'attendance',
      entityId: `${startDate}__${endDate}`,
      after: { startDate, endDate, deleted },
    });
    queueDatabaseBackup('attendance-cleanup');
    return res.json({ ok: true, deleted, startDate, endDate });
  } catch (error) {
    return res.status(500).json({ error: 'attendance_cleanup_failed', message: String(error?.message || error) });
  }
});

app.get('/api/logs', requireAccess(Access.logsRead), async (req, res) => {
  const scope = readSandboxScope(req);
  const view = String(req.query?.view || '').trim().toLowerCase();
  const limit = req.query?.limit;
  const offset = req.query?.offset;
  const days = req.query?.days;
  const startDate = req.query?.startDate;
  const endDate = req.query?.endDate;
  const hasPaging = view || limit != null || offset != null || days != null || startDate || endDate;
  const options = hasPaging ? {
    view: view || 'list',
    limit,
    offset,
    days,
    startDate,
    endDate,
  } : {};
  const logs = await readJsonCollection('apg.logs', [], scope, null, options);
  if (authUsesGlobalDataRead(req.auth)) return res.json(logs);
  if (!req.auth?.gymCodeId) return res.json([]);
  const branchScope = await loadBranchScope(getSupabase(), req.auth);
  res.json(logs.filter((l) => logMatchesBranchScope(l, branchScope)));
});

app.put('/api/logs/bulk', requireLogsBulkAccess, async (req, res) => {
  await writeScopedCollection(req, 'apg.logs', req.body?.logs || []);
  queueDatabaseBackup('logs-bulk');
  res.json({ ok: true });
});

// Owner-only delete of log entries whose timestamp falls inside the supplied
// range. Inputs may be either ISO timestamps or YYYY-MM-DD dates; date-only
// is widened to the full day. The audit entry recording the deletion is
// written AFTER the cleanup so it survives. On Supabase the cleanup is a
// single SQL DELETE — no collection round-trip — keeping it usable on busy
// gyms with tens of thousands of audit rows.
app.post('/api/logs/cleanup', requireAccess(Access.logsClear), async (req, res) => {
  try {
    const range = normalizeDateRange(req.body?.startDate, req.body?.endDate);
    if (!range) {
      return res.status(400).json({ error: 'invalid_range', message: 'startDate/endDate required (ISO date or timestamp)' });
    }
    const startIso = new Date(range.startMs).toISOString();
    const endIso = new Date(range.endMs).toISOString();
    let deleted = 0;
    let remaining = null;
    if (authIsOwner(req.auth)) {
      ({ deleted, remaining } = await deleteLogsInRange(readSandboxScope(req), { startIso, endIso }));
    } else {
      if (!req.auth?.gymCodeId) {
        return res.status(403).json({ error: 'branch-scope-missing', message: 'Staff branch scope is required.' });
      }
      const branchScope = await loadBranchScope(getSupabase(), req.auth);
      const logs = await readJsonCollection('apg.logs', [], readSandboxScope(req), null, {
        view: 'list',
        startDate: range.startDate,
        endDate: range.endDate,
        limit: 5000,
      });
      const scopedIds = (Array.isArray(logs) ? logs : [])
        .filter((l) => logMatchesBranchScope(l, branchScope))
        .map((l) => String(l?.id || '').trim())
        .filter(Boolean);
      ({ deleted, remaining } = await deleteLogsByIds(readSandboxScope(req), scopedIds));
    }
    await appendAuditLog(req, {
      action: 'logs.range.cleared',
      entityType: 'logs',
      entityId: `${range.startDate}__${range.endDate}`,
      after: { startDate: range.startDate, endDate: range.endDate, deleted, scoped: !authIsOwner(req.auth) },
    });
    queueDatabaseBackup('logs-cleanup');
    return res.json({ ok: true, deleted, remaining: remaining == null ? null : remaining, startDate: range.startDate, endDate: range.endDate });
  } catch (error) {
    return res.status(500).json({ error: 'logs_cleanup_failed', message: String(error?.message || error) });
  }
});

app.get('/api/finance', requireAccess(Access.financeRead), async (req, res) => {
  const finance = await readScopedCollection(req, 'apg.finance', []);
  if (authUsesGlobalDataRead(req.auth)) return res.json(finance);
  if (!req.auth?.gymCodeId) return res.json([]);
  const scope = await loadBranchScope(getSupabase(), req.auth);
  res.json(finance.filter((t) => {
    const mid = String(t?.memberId || '').trim();
    if (!mid) return false;
    return scope.memberCodes?.has(mid);
  }));
});

/** SQL-verified collected revenue by payment_transaction_date (paid_at). */
app.get('/api/finance/summary', requireAccess(Access.financeRead), async (req, res) => {
  try {
    const { readFinanceSummary } = await import('./db/dataStore.js');
    const branchScope = resolveReadBranchScope(req.auth);
    const month = String(req.query?.month || '').trim();
    const year = req.query?.year != null ? Number(req.query.year) : 0;
    const includeLines = req.query?.includeLines === '1' || req.query?.includeLines === 'true';
    if (year) {
      const body = await readFinanceSummary(branchScope, { year, includeLines });
      return res.json(body);
    }
    if (!month) {
      return res.status(400).json({ error: 'month_required', message: 'Query month=YYYY-MM or year=YYYY' });
    }
    const body = await readFinanceSummary(branchScope, { month, includeLines });
    return res.json(body);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: status === 400 ? 'invalid_month' : 'finance_summary_failed',
      message: String(error?.message || error),
    });
  }
});

/** Alias for 12-month reconciliation from DB payments. */
app.get('/api/finance/reconciliation', requireAccess(Access.financeRead), async (req, res) => {
  try {
    const { readFinanceSummary } = await import('./db/dataStore.js');
    const branchScope = resolveReadBranchScope(req.auth);
    const year = Number(req.query?.year) || new Date().getFullYear();
    const body = await readFinanceSummary(branchScope, { year });
    return res.json(body);
  } catch (error) {
    return res.status(500).json({
      error: 'finance_reconciliation_failed',
      message: String(error?.message || error),
    });
  }
});

app.put('/api/finance/bulk', requireAccess(Access.financeWrite), async (req, res) => {
  let incoming = Array.isArray(req.body?.finance) ? req.body.finance : [];
  if (!authIsOwner(req.auth)) {
    if (!req.auth?.gymCodeId) {
      incoming = [];
    } else {
      const scope = await loadBranchScope(getSupabase(), req.auth);
      incoming = incoming.filter((t) => {
        const mid = String(t?.memberId || '').trim();
        return mid && scope.memberCodes?.has(mid);
      });
    }
  }
  await writeScopedCollection(req, 'apg.finance', incoming);
  queueDatabaseBackup('finance-bulk');
  res.json({ ok: true });
});

app.get('/api/sms-events', requireAccess(Access.smsRead), async (req, res) => {
  const events = await readScopedCollection(req, 'apg.sms.events', []);
  if (authUsesGlobalDataRead(req.auth)) return res.json(events);
  if (!req.auth?.gymCodeId) return res.json([]);
  const scope = await loadBranchScope(getSupabase(), req.auth);
  res.json(events.filter((e) => {
    const mid = String(e?.memberId || '').trim();
    if (!mid) return false; // sms events without member are owner-only
    return scope.memberCodes?.has(mid);
  }));
});

app.put('/api/sms-events/bulk', requireAccess(Access.smsWrite), async (req, res) => {
  let incoming = Array.isArray(req.body?.smsEvents) ? req.body.smsEvents : [];
  if (!authIsOwner(req.auth)) {
    if (!req.auth?.gymCodeId) {
      incoming = [];
    } else {
      const scope = await loadBranchScope(getSupabase(), req.auth);
      incoming = incoming.filter((e) => {
        const mid = String(e?.memberId || '').trim();
        return mid && scope.memberCodes?.has(mid);
      });
    }
  }
  await writeScopedCollection(req, 'apg.sms.events', incoming);
  queueDatabaseBackup('sms-events-bulk');
  res.json({ ok: true });
});

app.post('/api/test-users/purge', requireMasterOwner, async (req, res) => {
  const sandboxId = String(req.body?.sandboxId || '').trim();
  const userId = String(req.body?.userId || '').trim();
  if (!sandboxId) return res.status(400).json({ error: 'sandbox-id-required' });
  await purgeSandboxData(sandboxId);
  queueDatabaseBackup('test-user-purge', { force: true });
  return res.json({ ok: true, sandboxId, userId });
});

app.get('/api/storage', requireMasterOwner, async (_req, res) => {
  const data = await computeStorageUsage();
  res.json(data);
});

app.get('/api/backups', requireMasterOwner, async (_req, res) => {
  const backups = await listBackupNames();
  res.json({ backups });
});

app.delete('/api/backups/:fileName', requireMasterOwner, async (req, res) => {
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

app.post('/api/backups/prune-older', requireMasterOwner, async (req, res) => {
  const days = Number(req.body?.days || 0);
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: 'invalid-days' });
  await pruneBackups({ keepLatest: MAX_DB_BACKUPS, maxAgeDays: days, hardCapBytes: MAX_BACKUP_TOTAL_BYTES, compressOld: COMPRESS_OLD_BACKUPS });
  const backups = await listBackupNames();
  const storage = await computeStorageUsage();
  return res.json({ ok: true, backups, storage });
});

app.post('/api/backups/keep-latest', requireMasterOwner, async (req, res) => {
  const count = Number(req.body?.count || 0);
  if (!Number.isFinite(count) || count < 1) return res.status(400).json({ error: 'invalid-count' });
  await pruneBackups({ keepLatest: count, maxAgeDays: null, hardCapBytes: MAX_BACKUP_TOTAL_BYTES, compressOld: COMPRESS_OLD_BACKUPS });
  const backups = await listBackupNames();
  const storage = await computeStorageUsage();
  return res.json({ ok: true, backups, storage });
});

app.post('/api/backups/restore', requireMasterOwner, async (req, res) => {
  const fileName = req.body?.fileName || '';
  if (!fileName) return res.status(400).json({ error: 'file-required' });
  if (useSupabase()) {
    return res.status(400).json({
      error: 'restore-not-supported',
      message: 'SQLite backup restore is disabled while DATA_BACKEND=supabase. Use Supabase backups instead.',
    });
  }
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

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[backend] unhandledRejection:', reason?.message || reason);
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${env.PORT} (data: ${dataBackendLabel()})`);
  if (useSupabase()) {
    pingDataStore()
      .then(async () => {
        const rt = await startSupabaseRealtimeListener();
        // eslint-disable-next-line no-console
        console.log(`Supabase members table: ${membersTableName}; realtime: ${rt.ok ? 'on' : rt.reason || 'off'}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Supabase init warning:', err?.message || err);
      });
  }
});
