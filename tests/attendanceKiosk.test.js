import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ATTENDANCE_QR_GRACE_MS,
  ATTENDANCE_QR_ROTATION_MS,
  buildChallengeCode,
  buildQrScanUrl,
  encodeQrPayload,
  getCurrentChallenge,
  parseQrPayload,
  validateChallengeCode,
  windowIndexAt,
} from '../backend/src/services/attendanceKiosk/attendanceChallenge.js';
import { createKioskDeviceStore } from '../backend/src/services/attendanceKiosk/kioskDeviceStore.js';
import {
  clearKioskPunchFeed,
  listRecentKioskPunches,
  recordKioskPunch,
} from '../backend/src/services/attendanceKiosk/kioskPunchFeed.js';
import {
  buildAttendanceKioskViewUrl,
  toAbsoluteKioskUrl,
  saveAttendanceKioskCreds,
  readSavedAttendanceKioskCreds,
  clearSavedAttendanceKioskCreds,
} from '../src/features/attendance/attendanceKioskClient.js';

const SECRET = 'unit-test-secret';
const GYM = 'gym-1';
const BRANCH = 'branch-aaa';

describe('attendanceChallenge', () => {
  it('builds stable codes for the same window', () => {
    const a = buildChallengeCode({ secret: SECRET, gymId: GYM, branchId: BRANCH, windowIndex: 100 });
    const b = buildChallengeCode({ secret: SECRET, gymId: GYM, branchId: BRANCH, windowIndex: 100 });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });

  it('changes code across windows and branches', () => {
    const w = buildChallengeCode({ secret: SECRET, gymId: GYM, branchId: BRANCH, windowIndex: 10 });
    const next = buildChallengeCode({ secret: SECRET, gymId: GYM, branchId: BRANCH, windowIndex: 11 });
    const other = buildChallengeCode({ secret: SECRET, gymId: GYM, branchId: 'branch-bbb', windowIndex: 10 });
    expect(w).not.toBe(next);
    expect(w).not.toBe(other);
  });

  it('getCurrentChallenge includes countdown and payload', () => {
    const now = 1_700_000_000_000;
    const ch = getCurrentChallenge({
      secret: SECRET,
      gymId: GYM,
      branchId: BRANCH,
      branchCode: 'HQ',
      nowMs: now,
    });
    expect(ch.code).toBeTruthy();
    expect(ch.qrPayload.startsWith('APG1|HQ|')).toBe(true);
    expect(ch.refreshInMs).toBeGreaterThan(0);
    expect(ch.refreshInMs).toBeLessThanOrEqual(ATTENDANCE_QR_ROTATION_MS);
    expect(ch.expiresAt).toBeGreaterThan(now);
  });

  it('accepts current window code', () => {
    const now = 1_700_000_060_000;
    const ch = getCurrentChallenge({ secret: SECRET, gymId: GYM, branchId: BRANCH, nowMs: now });
    const ok = validateChallengeCode({
      secret: SECRET,
      gymId: GYM,
      branchId: BRANCH,
      code: ch.code,
      nowMs: now + 5_000,
    });
    expect(ok).toEqual({ ok: true, windowIndex: ch.windowIndex, graceUsed: false });
  });

  it('accepts previous window within offline grace (~90s)', () => {
    const rotation = ATTENDANCE_QR_ROTATION_MS;
    const w = 500;
    const windowEnd = (w + 1) * rotation;
    const prevCode = buildChallengeCode({
      secret: SECRET,
      gymId: GYM,
      branchId: BRANCH,
      windowIndex: w,
    });
    const duringGrace = windowEnd + Math.floor(ATTENDANCE_QR_GRACE_MS / 2);
    const ok = validateChallengeCode({
      secret: SECRET,
      gymId: GYM,
      branchId: BRANCH,
      code: prevCode,
      nowMs: duringGrace,
    });
    expect(ok.ok).toBe(true);
    expect(ok.graceUsed).toBe(true);
    expect(ok.windowIndex).toBe(w);

    const afterGrace = windowEnd + ATTENDANCE_QR_GRACE_MS + 1_000;
    const bad = validateChallengeCode({
      secret: SECRET,
      gymId: GYM,
      branchId: BRANCH,
      code: prevCode,
      nowMs: afterGrace,
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects wrong branch even with valid-looking code', () => {
    const now = Date.now();
    const ch = getCurrentChallenge({ secret: SECRET, gymId: GYM, branchId: BRANCH, nowMs: now });
    const bad = validateChallengeCode({
      secret: SECRET,
      gymId: GYM,
      branchId: 'other-branch',
      code: ch.code,
      nowMs: now,
    });
    expect(bad.ok).toBe(false);
  });

  it('parses APG1 and deep-link payloads', () => {
    const encoded = encodeQrPayload({
      branchKey: 'HQ',
      branchId: BRANCH,
      code: 'abc123XYZ',
      expiresAt: 123,
    });
    expect(parseQrPayload(encoded)).toMatchObject({
      branchKey: 'HQ',
      code: 'abc123XYZ',
      expiresAt: 123,
    });
    expect(parseQrPayload('apg-att://v1/HQ/tokENCODE12')).toMatchObject({
      branchKey: 'HQ',
      code: 'tokENCODE12',
    });
    expect(parseQrPayload('bareCode99AA')).toMatchObject({ code: 'bareCode99AA' });
  });

  it('builds HTTPS scan URLs and parses them back', () => {
    const payload = encodeQrPayload({
      branchKey: 'AP01',
      branchId: BRANCH,
      code: 'tokENCODE12',
      expiresAt: 999,
    });
    const url = buildQrScanUrl({
      publicBase: 'https://app.gymactionplus.com',
      gymCode: 'AP01',
      qrPayload: payload,
    });
    expect(url.startsWith('https://app.gymactionplus.com/api/public/attendance-kiosk/AP01/scan?')).toBe(true);
    expect(url).toContain('p=');
    expect(parseQrPayload(url)).toMatchObject({
      branchKey: 'AP01',
      code: 'tokENCODE12',
      expiresAt: 999,
    });
  });

  it('windowIndexAt floors by rotation', () => {
    expect(windowIndexAt(0, 60_000)).toBe(0);
    expect(windowIndexAt(59_999, 60_000)).toBe(0);
    expect(windowIndexAt(60_000, 60_000)).toBe(1);
  });
});

describe('kioskDeviceStore', () => {
  let store;
  let filePath;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `apg-kiosk-${Date.now()}-${Math.random()}.json`);
    store = createKioskDeviceStore({ filePath });
  });

  it('creates, verifies, lists, and revokes devices', () => {
    const created = store.createDevice({ gymId: GYM, branchId: BRANCH, label: 'Front desk' });
    expect(created.token.startsWith('apk_')).toBe(true);
    expect(created.device.label).toBe('Front desk');

    const ok = store.verifyDeviceToken(created.token, { gymId: GYM, branchId: BRANCH });
    expect(ok.ok).toBe(true);
    expect(ok.device.id).toBe(created.device.id);

    const listed = store.listDevices({ gymId: GYM, branchId: BRANCH });
    expect(listed).toHaveLength(1);

    expect(store.revokeDevice(created.device.id)).toBe(true);
    const denied = store.verifyDeviceToken(created.token, { gymId: GYM, branchId: BRANCH });
    expect(denied.ok).toBe(false);
    expect(store.listDevices({ branchId: BRANCH })).toHaveLength(0);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('rejects branch mismatch', () => {
    const created = store.createDevice({ gymId: GYM, branchId: BRANCH, label: 'A' });
    const bad = store.verifyDeviceToken(created.token, { gymId: GYM, branchId: 'other' });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('device-branch-mismatch');
  });
});

describe('kioskPunchFeed', () => {
  beforeEach(() => clearKioskPunchFeed());

  it('keeps recent punches per branch', () => {
    recordKioskPunch(BRANCH, { staffName: 'A', userId: 'a', punchType: 'login', method: 'qr' });
    recordKioskPunch(BRANCH, { staffName: 'B', userId: 'b', punchType: 'logout', method: 'pin' });
    const rows = listRecentKioskPunches(BRANCH, 5);
    expect(rows[0].staffName).toBe('B');
    expect(rows).toHaveLength(2);
    expect(listRecentKioskPunches('other')).toHaveLength(0);
  });
});

describe('attendanceKioskClient', () => {
  it('builds public kiosk URL', () => {
    expect(buildAttendanceKioskViewUrl({
      apiOrigin: 'https://gym.example',
      gymCode: 'HQ',
      deviceToken: 'apk_abc',
    })).toBe('https://gym.example/attendance/kiosk?gym=HQ&device=apk_abc');
    expect(buildAttendanceKioskViewUrl({
      gymCode: 'HQ',
      deviceToken: 'apk_abc',
    })).toBe('/attendance/kiosk?gym=HQ&device=apk_abc');
  });

  it('makes absolute kiosk URLs', () => {
    expect(toAbsoluteKioskUrl('/api/public/attendance-kiosk/HQ/view?device=x', 'https://gym.local'))
      .toBe('https://gym.local/api/public/attendance-kiosk/HQ/view?device=x');
    expect(toAbsoluteKioskUrl('https://gym.local/api/x', 'https://ignored'))
      .toBe('https://gym.local/api/x');
  });

  it('persists and clears saved kiosk creds', () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    saveAttendanceKioskCreds('branch-1', {
      url: 'https://gym.local/kiosk',
      token: 'apk_test',
      deviceId: 'd1',
      gymCode: 'HQ',
    });
    expect(readSavedAttendanceKioskCreds('branch-1')).toMatchObject({
      url: 'https://gym.local/kiosk',
      token: 'apk_test',
    });
    clearSavedAttendanceKioskCreds('branch-1');
    expect(readSavedAttendanceKioskCreds('branch-1')).toBeNull();
  });
});
