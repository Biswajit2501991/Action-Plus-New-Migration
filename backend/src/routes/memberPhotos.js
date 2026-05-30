import { Router } from 'express';
import crypto from 'node:crypto';
import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { resolveReadBranchScope } from '../auth/branchScope.js';
import { appendAuditLogEntry } from '../db/dataStore.js';
import {
  uploadMemberPhoto,
  deleteMemberPhoto,
  batchMemberPhotoSignedUrls,
} from '../services/memberPhoto/MemberPhotoService.js';

const router = Router();

function branchScope(req) {
  return resolveReadBranchScope(req.auth);
}

/** Batch signed URLs for list avatars (Option A). Must register before /:memberId routes. */
router.post('/photo-urls', requireAccess(Access.membersRead), async (req, res) => {
  const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
  try {
    const result = await batchMemberPhotoSignedUrls(req.auth, memberIds, branchScope(req));
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'photo-urls-failed',
      detail: err?.detail || null,
    });
  }
});

router.post('/:memberId/photo', requireAccess(Access.membersWrite), async (req, res) => {
  const memberCode = decodeURIComponent(String(req.params.memberId || '').trim());
  if (!memberCode) return res.status(400).json({ error: 'member-code-required' });
  const image = req.body?.image || req.body?.photo || req.body?.dataUrl;
  try {
    const result = await uploadMemberPhoto(req.auth, memberCode, image, branchScope(req));
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'member.photo.uploaded',
      entityType: 'member',
      entityId: memberCode,
      before: { photoVersion: Math.max(0, Number(result.photoVersion || 1) - 1) },
      after: { photoVersion: result.photoVersion, storagePath: result.storagePath },
    }).catch(() => {});
    return res.json({
      ok: true,
      member: result.member,
      photoUrl: result.photoUrl,
      photoVersion: result.photoVersion,
    });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'member-photo-upload-failed',
      detail: err?.detail || null,
    });
  }
});

router.delete('/:memberId/photo', requireAccess(Access.membersWrite), async (req, res) => {
  const memberCode = decodeURIComponent(String(req.params.memberId || '').trim());
  if (!memberCode) return res.status(400).json({ error: 'member-code-required' });
  try {
    const member = await deleteMemberPhoto(req.auth, memberCode, branchScope(req));
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'member.photo.deleted',
      entityType: 'member',
      entityId: memberCode,
      before: { hadPhoto: true },
      after: { hadPhoto: false },
    }).catch(() => {});
    return res.json({ ok: true, member });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || 'member-photo-delete-failed',
      detail: err?.detail || null,
    });
  }
});

export default router;
