import crypto from 'node:crypto';
import { Router } from 'express';
import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { requireMasterOwner } from '../middleware/requireMasterOwner.js';
import { appendAuditLogEntry } from '../db/dataStore.js';
import {
  applyGlobalLeaveAdjustment,
  buildLeaveBalanceSnapshot,
  previewGlobalLeaveAdjustment,
} from '../services/leave/leaveBalanceService.js';

const router = Router();

function leaveBalanceError(err, fallback) {
  return {
    error: err?.message || fallback,
    message: err?.detail || err?.message || fallback,
    detail: err?.detail || null,
  };
}

router.get('/', requireAccess(Access.leaveBalanceView), async (req, res) => {
  try {
    const year = Number(req.query?.year) || new Date().getFullYear();
    const snapshot = await buildLeaveBalanceSnapshot(year);
    const caller = String(req.auth?.userId || '').trim().toLowerCase();
    const isOwner = req.access?.__owner || caller === 'owner';
    let rows = snapshot.rows;
    if (!isOwner) {
      rows = rows.filter((r) => String(r.userId || '').trim().toLowerCase() === caller);
    }
    return res.json({
      ok: true,
      calendarYear: snapshot.calendarYear,
      baseDays: snapshot.baseDays,
      adjustments: snapshot.adjustments,
      rows,
    });
  } catch (err) {
    return res.status(err?.status || 500).json(leaveBalanceError(err, 'leave-balance-read-failed'));
  }
});

router.post('/preview', requireMasterOwner, async (req, res) => {
  try {
    const adjustmentDays = Number(req.body?.adjustmentDays);
    const calendarYear = Number(req.body?.calendarYear) || new Date().getFullYear();
    const preview = await previewGlobalLeaveAdjustment(adjustmentDays, calendarYear);
    return res.json({ ok: true, ...preview });
  } catch (err) {
    return res.status(err?.status || 500).json(leaveBalanceError(err, 'leave-balance-preview-failed'));
  }
});

router.post('/adjust', requireMasterOwner, async (req, res) => {
  try {
    const adjustmentDays = Number(req.body?.adjustmentDays);
    const calendarYear = Number(req.body?.calendarYear) || new Date().getFullYear();
    const reason = String(req.body?.reason || '').trim();
    const createdBy = String(req.auth?.userId || 'owner');
    const result = await applyGlobalLeaveAdjustment(adjustmentDays, calendarYear, createdBy, reason);
      await appendAuditLogEntry(null, {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        actor: createdBy,
        action: 'leave.balance.adjusted',
        entityType: 'leave_balance',
        entityId: result.adjustment?.id || 'global',
        after: {
          adjustmentDays,
          calendarYear,
          affectedCount: result.balances?.length || 0,
          reason: reason || undefined,
        },
      }).catch(() => {});
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(err?.status || 500).json(leaveBalanceError(err, 'leave-balance-adjust-failed'));
  }
});

export default router;
