import { Router } from 'express';
import crypto from 'node:crypto';
import { requireStaffManagementWrite } from '../middleware/requireStaffManagement.js';
import { engineCanListStaff } from '../auth/tenant/scopedAuthorizationEngine.js';
import { appendAuditLogEntry } from '../db/dataStore.js';
import { uploadStaffPhoto, deleteStaffPhoto, batchStaffPhotoSignedUrls } from '../services/staffPhoto/StaffPhotoService.js';

const router = Router();

/**
 * Batch signed URLs for staff list avatars.
 * Admins can batch any staff; other authenticated staff may only request their own id.
 */
router.post('/photo-urls', async (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  const staffIds = Array.isArray(req.body?.staffIds) ? req.body.staffIds : [];
  const normalized = [...new Set(staffIds.map((x) => String(x || '').trim()).filter(Boolean))];
  const selfId = String(req.auth.userId || '').trim();
  const canList = engineCanListStaff(req.auth);
  const allowed = canList
    ? normalized
    : normalized.filter((id) => id.toLowerCase() === selfId.toLowerCase());
  if (!canList && !allowed.length) {
    return res.status(403).json({
      error: 'branch-admin-required',
      message: 'This action requires branch administrator privileges.',
    });
  }
  try {
    const result = await batchStaffPhotoSignedUrls(allowed);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'staff-photo-urls-failed',
      detail: err?.detail || null,
    });
  }
});

router.post('/:staffId/photo', requireStaffManagementWrite, async (req, res) => {
  const staffId = decodeURIComponent(String(req.params.staffId || '').trim());
  if (!staffId) return res.status(400).json({ error: 'staff-id-required' });
  const image = req.body?.image || req.body?.photo || req.body?.dataUrl;
  try {
    const result = await uploadStaffPhoto(req.auth, staffId, image);
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'staff.photo.uploaded',
      entityType: 'user',
      entityId: staffId,
      before: { photoVersion: Math.max(0, Number(result.photoVersion || 1) - 1) },
      after: { photoVersion: result.photoVersion, storagePath: result.storagePath },
    }).catch(() => {});
    return res.json({
      ok: true,
      user: result.user,
      photoUrl: result.photoUrl,
      photoVersion: result.photoVersion,
    });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'staff-photo-upload-failed',
      detail: err?.detail || null,
    });
  }
});

router.delete('/:staffId/photo', requireStaffManagementWrite, async (req, res) => {
  const staffId = decodeURIComponent(String(req.params.staffId || '').trim());
  if (!staffId) return res.status(400).json({ error: 'staff-id-required' });
  try {
    const user = await deleteStaffPhoto(req.auth, staffId);
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'staff.photo.deleted',
      entityType: 'user',
      entityId: staffId,
      before: { hadPhoto: true },
      after: { hadPhoto: false },
    }).catch(() => {});
    return res.json({ ok: true, user });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'staff-photo-delete-failed',
      detail: err?.detail || null,
    });
  }
});

export default router;
