/**
 * File-backed kiosk device tokens (per-branch). Plain token shown once at create.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(__dirname, '../../../../data/attendance-kiosk-devices.json');

function hashToken(plain) {
  return crypto.createHash('sha256').update(String(plain || '')).digest('hex');
}

function emptyStore() {
  return { version: 1, devices: [] };
}

function readStore(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.devices)) return emptyStore();
    return { version: 1, devices: parsed.devices };
  } catch {
    return emptyStore();
  }
}

function writeStore(filePath, store) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function createKioskDeviceStore(options = {}) {
  const filePath = options.filePath || DEFAULT_PATH;
  let memoryOverride = options.memoryOnly ? emptyStore() : null;

  const load = () => (memoryOverride || readStore(filePath));
  const save = (store) => {
    if (memoryOverride) {
      memoryOverride = store;
      return;
    }
    writeStore(filePath, store);
  };

  return {
    filePath,
    listDevices({ gymId, branchId } = {}) {
      const store = load();
      return store.devices
        .filter((d) => !d.revokedAt)
        .filter((d) => !gymId || String(d.gymId) === String(gymId))
        .filter((d) => !branchId || String(d.branchId) === String(branchId))
        .map((d) => ({
          id: d.id,
          gymId: d.gymId,
          branchId: d.branchId,
          label: d.label,
          createdAt: d.createdAt,
          lastSeenAt: d.lastSeenAt || null,
        }));
    },

    createDevice({ gymId, branchId, label = 'Kiosk' }) {
      const gid = String(gymId || '').trim();
      const bid = String(branchId || '').trim();
      if (!gid || !bid) {
        const err = new Error('gym-and-branch-required');
        err.status = 400;
        throw err;
      }
      const plainToken = `apk_${crypto.randomBytes(24).toString('hex')}`;
      const device = {
        id: crypto.randomUUID(),
        gymId: gid,
        branchId: bid,
        label: String(label || 'Kiosk').trim().slice(0, 80) || 'Kiosk',
        tokenHash: hashToken(plainToken),
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
        revokedAt: null,
      };
      const store = load();
      store.devices.push(device);
      save(store);
      return { device: { id: device.id, gymId, branchId: bid, label: device.label, createdAt: device.createdAt }, token: plainToken };
    },

    revokeDevice(deviceId) {
      const store = load();
      const id = String(deviceId || '').trim();
      const row = store.devices.find((d) => d.id === id);
      if (!row) return false;
      row.revokedAt = new Date().toISOString();
      save(store);
      return true;
    },

    /**
     * @returns {{ ok: true, device } | { ok: false, reason: string }}
     */
    verifyDeviceToken(plainToken, { gymId, branchId } = {}) {
      const token = String(plainToken || '').trim();
      if (!token) return { ok: false, reason: 'device-token-required' };
      const hash = hashToken(token);
      const store = load();
      const row = store.devices.find((d) => d.tokenHash === hash && !d.revokedAt);
      if (!row) return { ok: false, reason: 'invalid-device-token' };
      if (gymId && String(row.gymId) !== String(gymId)) {
        return { ok: false, reason: 'device-gym-mismatch' };
      }
      if (branchId && String(row.branchId) !== String(branchId)) {
        return { ok: false, reason: 'device-branch-mismatch' };
      }
      row.lastSeenAt = new Date().toISOString();
      save(store);
      return {
        ok: true,
        device: {
          id: row.id,
          gymId: row.gymId,
          branchId: row.branchId,
          label: row.label,
        },
      };
    },
  };
}

export const kioskDeviceStore = createKioskDeviceStore();
