import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { authIsMasterOwner } from '../auth/tenant/scopedAuth.js';
import {
  getOfferSettings,
  listRecentRedemptions,
  lookupOfferMember,
  saveOfferEligibleStatuses,
  saveOfferRedemption,
  computeCustomerPay,
} from '../services/offersService.js';
import { setOffersPasscode } from '../auth/staffAuth.js';

export function registerOffersRoutes(app, { appendAuditLog } = {}) {
  app.get(
    '/api/offers/settings',
    requireAccess(Access.offersRead),
    async (req, res) => {
      try {
        const settings = await getOfferSettings(req.auth);
        return res.json({ ok: true, ...settings });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-settings-failed',
          message: err?.message || 'Could not load offer settings.',
        });
      }
    },
  );

  app.patch(
    '/api/offers/settings',
    requireAccess(Access.offersManage),
    async (req, res) => {
      try {
        if (!authIsMasterOwner(req.auth) && !req.access?.__owner) {
          // Access.offersManage also allows manageSystemFeatures — route gate handles it
        }
        const saved = await saveOfferEligibleStatuses(
          req.auth,
          req.body?.eligibleStatuses || req.body?.statuses,
        );
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'offers.settings.updated',
            entityType: 'offers',
            entityId: 'eligible-statuses',
            after: saved,
          });
        }
        return res.json({ ok: true, ...saved });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-settings-save-failed',
          message: err?.message || 'Could not save offer settings.',
        });
      }
    },
  );

  app.get(
    '/api/offers/lookup-member',
    requireAccess(Access.offersRead),
    async (req, res) => {
      try {
        const mobile = req.query?.mobile || req.query?.phone || '';
        const result = await lookupOfferMember(req.auth, mobile);
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-lookup-failed',
          message: err?.message || 'Could not look up member.',
        });
      }
    },
  );

  app.get(
    '/api/offers/redemptions',
    requireAccess(Access.offersRead),
    async (req, res) => {
      try {
        const recent = await listRecentRedemptions(req.auth, 10);
        return res.json({ ok: true, redemptions: recent });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-redemptions-failed',
          message: err?.message || 'Could not load redemptions.',
        });
      }
    },
  );

  app.post(
    '/api/offers/redeem',
    requireAccess(Access.offersWrite),
    async (req, res) => {
      try {
        // Server recomputes pay amount — never trust client math for the log.
        const preview = computeCustomerPay(
          req.body?.totalCostInr ?? req.body?.totalCost,
          req.body?.offerPercent,
        );
        const result = await saveOfferRedemption(req.auth, {
          ...req.body,
          customerPayInr: preview,
        });
        if (typeof appendAuditLog === 'function') {
          await appendAuditLog(req, {
            action: 'offers.redeemed',
            entityType: 'offer_redemption',
            entityId: result.redemption?.id,
            after: {
              memberCode: result.redemption?.memberCode,
              offerPercent: result.redemption?.offerPercent,
              totalCostInr: result.redemption?.totalCostInr,
              customerPayInr: result.redemption?.customerPayInr,
            },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-redeem-failed',
          message: err?.message || 'Could not save offer redemption.',
        });
      }
    },
  );

  app.post(
    '/api/offers/passcode',
    requireAccess(Access.offersWrite),
    async (req, res) => {
      try {
        const loginId = String(req.auth?.userId || '').trim();
        const passcode = String(req.body?.passcode || req.body?.pin || '').trim();
        await setOffersPasscode(loginId, passcode);
        return res.json({ ok: true });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: 'offers-passcode-failed',
          message: err?.message || 'Could not save passcode.',
        });
      }
    },
  );
}
