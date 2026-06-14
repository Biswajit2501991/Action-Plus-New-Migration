import { Router } from 'express';
import crypto from 'node:crypto';
import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { appendAuditLogEntry } from '../db/dataStore.js';
import {
  createPaymentQrSetting,
  listPaymentQrSettings,
  updatePaymentQrSetting,
  uploadPaymentQrImage,
} from '../services/paymentQr/paymentQrService.js';

const router = Router();

function paymentQrErrorPayload(err, fallback) {
  return {
    error: err?.message || fallback,
    message: err?.detail || err?.message || fallback,
    detail: err?.detail || null,
  };
}

router.get('/', requireAccess(Access.paymentQrView), async (req, res) => {
  try {
    const activeOnly = String(req.query?.activeOnly || 'true').toLowerCase() !== 'false';
    const includeInactive = String(req.query?.includeInactive || '').toLowerCase() === 'true';
    const result = await listPaymentQrSettings(req.auth, {
      gymCodeId: req.query?.gymCodeId || req.query?.gym_code_id,
      activeOnly,
      includeInactive,
      signImages: true,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json(paymentQrErrorPayload(err, 'payment-qr-list-failed'));
  }
});

router.post('/', requireAccess(Access.paymentQrManage), async (req, res) => {
  try {
    const created = await createPaymentQrSetting(req.auth, req.body, {
      createdBy: String(req.auth?.userId || '').trim() || null,
    });
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'payment_qr.created',
      entityType: 'payment_qr',
      entityId: created.id,
      after: {
        id: created.id,
        qrName: created.qrName,
        gymCodeId: created.gymCodeId,
      },
    }).catch(() => {});
    return res.status(201).json({ ok: true, item: created });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json(paymentQrErrorPayload(err, 'payment-qr-create-failed'));
  }
});

router.patch('/:id', requireAccess(Access.paymentQrManage), async (req, res) => {
  const qrId = String(req.params?.id || '').trim();
  if (!qrId) return res.status(400).json({ error: 'payment-qr-id-required' });
  try {
    const updated = await updatePaymentQrSetting(req.auth, qrId, req.body);
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'payment_qr.updated',
      entityType: 'payment_qr',
      entityId: updated.id,
      after: {
        id: updated.id,
        qrName: updated.qrName,
        displayOrder: updated.displayOrder,
        isActive: updated.isActive,
      },
    }).catch(() => {});
    return res.json({ ok: true, item: updated });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json(paymentQrErrorPayload(err, 'payment-qr-update-failed'));
  }
});

router.post('/:id/image', requireAccess(Access.paymentQrManage), async (req, res) => {
  const qrId = String(req.params?.id || '').trim();
  if (!qrId) return res.status(400).json({ error: 'payment-qr-id-required' });
  const image = req.body?.image || req.body?.photo || req.body?.dataUrl;
  try {
    const result = await uploadPaymentQrImage(req.auth, qrId, image, {
      gymCodeId: req.body?.gymCodeId || req.body?.gym_code_id,
    });
    await appendAuditLogEntry(null, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      actor: String(req.auth?.userId || 'system'),
      action: 'payment_qr.image.uploaded',
      entityType: 'payment_qr',
      entityId: qrId,
      after: { imageVersion: result.item?.imageVersion },
    }).catch(() => {});
    return res.json({
      ok: true,
      item: result.item,
      photoUrl: result.photoUrl,
    });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json(paymentQrErrorPayload(err, 'payment-qr-image-upload-failed'));
  }
});

export default router;
