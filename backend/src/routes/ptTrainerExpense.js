/**
 * PT trainer expense routes — pending confirm / decline / dismiss / viewer lists.
 */

import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { authIsMasterOwner } from '../auth/tenant/scopedAuth.js';
import {
  confirmPending,
  declinePending,
  dismissPending,
  listOpenPendingForOwner,
  listOpenPendingForTrainer,
  listPendingForViewer,
} from '../services/ptTrainerExpenseService.js';

function authWithAccess(req) {
  return {
    ...req.auth,
    access: req.staffAccess || req.access,
    sections: req.auth?.sections,
    staffRole: req.auth?.staffRole,
    name: req.auth?.name,
  };
}

export function registerPtTrainerExpenseRoutes(app, { appendAuditLog } = {}) {
  app.get(
    '/api/pt-trainer-expense/pending',
    requireAccess(() => true),
    async (req, res) => {
      try {
        const auth = authWithAccess(req);
        let items = [];
        if (authIsMasterOwner(auth) || auth?.access?.__owner) {
          items = await listOpenPendingForOwner(auth);
        } else {
          items = await listOpenPendingForTrainer(auth);
        }
        return res.json({ ok: true, pending: items });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'pt-trainer-expense-pending-failed',
          message: err?.message || 'Could not load pending payouts.',
        });
      }
    },
  );

  app.get(
    '/api/pt-trainer-expense/pending-for-viewer',
    requireAccess(() => true),
    async (req, res) => {
      try {
        const auth = authWithAccess(req);
        const items = await listPendingForViewer(auth);
        return res.json({ ok: true, pending: items });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'pt-trainer-expense-viewer-failed',
          message: err?.message || 'Could not load pending payouts for viewer.',
        });
      }
    },
  );

  app.post(
    '/api/pt-trainer-expense/confirm',
    requireAccess(() => true),
    async (req, res) => {
      try {
        const id = String(req.body?.id || req.body?.pendingId || '').trim();
        const method = req.body?.method || req.body?.paymentMethod;
        const result = await confirmPending(authWithAccess(req), id, method);
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'pt_trainer_expense.confirmed',
            entityType: 'pt_trainer_expense_pending',
            entityId: id,
            after: {
              memberCode: result.pending?.memberCode,
              amountInr: result.pending?.amountInr,
              method: result.pending?.paymentMethod,
              expenseId: result.expense?.id,
            },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'pt-trainer-expense-confirm-failed',
          message: err?.message || 'Could not confirm payout.',
        });
      }
    },
  );

  app.post(
    '/api/pt-trainer-expense/decline',
    requireAccess(() => true),
    async (req, res) => {
      try {
        const id = String(req.body?.id || req.body?.pendingId || '').trim();
        const result = await declinePending(authWithAccess(req), id);
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'pt_trainer_expense.declined',
            entityType: 'pt_trainer_expense_pending',
            entityId: id,
            after: { memberCode: result.pending?.memberCode },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'pt-trainer-expense-decline-failed',
          message: err?.message || 'Could not decline payout.',
        });
      }
    },
  );

  app.post(
    '/api/pt-trainer-expense/dismiss',
    requireAccess(Access.logsAppend),
    async (req, res) => {
      try {
        const id = String(req.body?.id || req.body?.pendingId || '').trim();
        const result = await dismissPending(authWithAccess(req), id);
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'pt_trainer_expense.dismissed',
            entityType: 'pt_trainer_expense_pending',
            entityId: id,
            after: { memberCode: result.pending?.memberCode },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'pt-trainer-expense-dismiss-failed',
          message: err?.message || 'Could not dismiss payout.',
        });
      }
    },
  );
}
