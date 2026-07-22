import crypto from 'node:crypto';
import { useSupabase } from '../../db/dataStore.js';
import * as kvStore from '../../db/kvStore.js';

const STORE_KEY = 'apg.attendance_kiosk_devices';

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

async function loadDevicesSqlite() {
  const raw = await kvStore.readJsonValue(STORE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

async function saveDevicesSqlite(list) {
  await kvStore.writeJsonValue(STORE_KEY, Array.isArray(list) ? list : []);
}

/**
 * Create a long-lived device token for an always-on wall tablet kiosk.
 * Raw token is returned once; only the hash is persisted.
 */
export async function createAttendanceKioskDevice({
  gymCodeId,
  gymCode,
  label,
  createdBy,
}) {
  const branchId = String(gymCodeId || '').trim();
  const code = String(gymCode || '').trim();
  if (!branchId) {
    const err = new Error('gym-code-id-required');
    err.status = 400;
    err.code = 'gym-code-id-required';
    throw err;
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const labelSafe = String(label || 'Reception Kiosk').trim().slice(0, 80) || 'Reception Kiosk';
  const createdBySafe = createdBy ? String(createdBy).slice(0, 120) : null;
  const createdAt = new Date().toISOString();

  let id = crypto.randomUUID();

  if (useSupabase()) {
    const { getSupabase, gymId } = await import('../../db/supabase/client.js');
    const sb = getSupabase();
    const gid = gymId();
    const { data, error } = await sb
      .from('attendance_kiosk_devices')
      .insert({
        gym_id: gid,
        gym_code_id: branchId,
        gym_code: code || null,
        token_hash: tokenHash,
        label: labelSafe,
        created_by: createdBySafe,
      })
      .select('id, gym_code_id, gym_code, label, created_at')
      .maybeSingle();
    if (error) {
      const err = new Error(error.message || 'kiosk-device-create-failed');
      err.status = 500;
      throw err;
    }
    id = data?.id || id;
    const pathCode = encodeURIComponent(code || branchId);
    return {
      token,
      kioskUrl: `/public/attendance-kiosk/${pathCode}?device=${encodeURIComponent(token)}`,
      device: {
        id,
        gymCodeId: data?.gym_code_id || branchId,
        gymCode: data?.gym_code || code || null,
        label: data?.label || labelSafe,
        createdAt: data?.created_at || createdAt,
      },
    };
  }

  const device = {
    id,
    tokenHash,
    gymCodeId: branchId,
    gymCode: code || null,
    label: labelSafe,
    createdAt,
    createdBy: createdBySafe,
    revokedAt: null,
  };
  const list = await loadDevicesSqlite();
  list.push(device);
  const trimmed = list.length > 80 ? list.slice(-80) : list;
  await saveDevicesSqlite(trimmed);

  const pathCode = encodeURIComponent(code || branchId);
  return {
    token,
    kioskUrl: `/public/attendance-kiosk/${pathCode}?device=${encodeURIComponent(token)}`,
    device: {
      id: device.id,
      gymCodeId: device.gymCodeId,
      gymCode: device.gymCode,
      label: device.label,
      createdAt: device.createdAt,
    },
  };
}

/**
 * Resolve a raw device token to a stored device (not revoked).
 */
export async function resolveAttendanceKioskDevice(rawToken, gymCodeHint) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const hint = String(gymCodeHint || '').trim().toLowerCase();

  if (useSupabase()) {
    const { getSupabase, gymId } = await import('../../db/supabase/client.js');
    const sb = getSupabase();
    const gid = gymId();
    let q = sb
      .from('attendance_kiosk_devices')
      .select('id, gym_code_id, gym_code, label, created_at, revoked_at')
      .eq('gym_id', gid)
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .limit(5);
    const { data, error } = await q;
    if (error || !data?.length) return null;
    const matched = data.find((d) => {
      if (!hint) return true;
      const code = String(d.gym_code || '').trim().toLowerCase();
      const id = String(d.gym_code_id || '').trim().toLowerCase();
      return code === hint || id === hint;
    });
    if (!matched) return null;
    return {
      id: matched.id,
      gymCodeId: matched.gym_code_id,
      gymCode: matched.gym_code,
      label: matched.label,
      createdAt: matched.created_at,
    };
  }

  const list = await loadDevicesSqlite();
  const matched = list.find((d) => {
    if (!d || d.revokedAt) return false;
    if (String(d.tokenHash || '') !== tokenHash) return false;
    if (!hint) return true;
    const code = String(d.gymCode || '').trim().toLowerCase();
    const id = String(d.gymCodeId || '').trim().toLowerCase();
    return code === hint || id === hint;
  });
  return matched || null;
}
