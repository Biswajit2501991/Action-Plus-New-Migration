import { Router } from 'express';
import crypto from 'node:crypto';
import { requireStaffManagementRead, requireStaffManagementWrite } from '../middleware/requireStaffManagement.js';
import { appendAuditLogEntry } from '../db/dataStore.js';
import { uploadStaffPhoto, deleteStaffPhoto, batchStaffPhotoSignedUrls } from '../services/staffPhoto/StaffPhotoService.js';

const router = Router();

/** Batch signed URLs for staff list avatars. Must register before /:staffId routes. */
router.post('/photo-urls', requireStaffManagementRead, async (req, res) => {
  const staffIds = Array.isArray(req.body?.staffIds) ? req.body.staffIds : [];
  try {
    const result = await batchStaffPhotoSignedUrls(staffIds);
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
