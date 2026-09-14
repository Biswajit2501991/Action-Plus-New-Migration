import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import {
  addVisitorStaffComment,
  listCommentsForVisitor,
  listVisitorStaffCommentsForScope,
} from '../services/visitorStaffComments.js';

export function registerVisitorStaffCommentRoutes(app, { appendAuditLog } = {}) {
  app.get(
    '/api/visitors/staff-comments',
    requireAccess(Access.visitorsRead),
    async (req, res) => {
      try {
        const comments = await listVisitorStaffCommentsForScope(req.auth);
        return res.json({ ok: true, comments });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'visitor-comments-load-failed',
          message: err?.message || 'Could not load staff comments.',
        });
      }
    },
  );

  app.get(
    '/api/visitors/:visitorId/staff-comments',
    requireAccess(Access.visitorsRead),
    async (req, res) => {
      try {
        const visitorId = String(req.params?.visitorId || '').trim();
        if (!visitorId) {
          return res.status(400).json({
            error: 'visitor-id-required',
            message: 'Visitor id is required.',
          });
        }
        const payload = await listCommentsForVisitor(req.auth, visitorId);
        return res.json({ ok: true, ...payload });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'visitor-comments-load-failed',
          message: err?.message || 'Could not load staff comments.',
        });
      }
    },
  );

  app.post(
    '/api/visitors/:visitorId/staff-comments',
    requireAccess(Access.visitorsWrite),
    async (req, res) => {
      try {
        const visitorId = String(req.params?.visitorId || '').trim();
        if (!visitorId) {
          return res.status(400).json({
            error: 'visitor-id-required',
            message: 'Visitor id is required.',
          });
        }
        const comment = await addVisitorStaffComment(
          req.auth,
          visitorId,
          req.body?.body ?? req.body?.comment ?? req.body?.text,
        );
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'visitor.staff_comment.added',
            entityType: 'visitor_staff_comment',
            entityId: comment.id,
            after: {
              visitorId: comment.visitorId,
              preview: String(comment.body || '').slice(0, 120),
            },
          });
        }
        return res.json({ ok: true, comment });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'visitor-comment-save-failed',
          message: err?.message || 'Could not save staff comment.',
        });
      }
    },
  );
}
