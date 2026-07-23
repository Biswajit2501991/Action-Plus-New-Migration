import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import {
  lookupReferralCode,
  applyMemberReferral,
  getPendingReferralCredits,
} from "../services/referrals/referralBillingService.js";
import {
  NEW_MEMBER_JOIN_DISCOUNT_INR,
  REFERRER_CREDIT_INR,
} from "../lib/referralBilling.js";

export function registerMemberReferralRoutes(app, { appendAuditLog }) {
  app.get(
    "/api/referrals/lookup",
    requireAccess(Access.membersRead),
    async (req, res) => {
      try {
        const code = String(req.query?.code || "").trim();
        const result = await lookupReferralCode(code);
        return res.json(result);
      } catch (error) {
        const status = Number(error?.status) || 500;
        return res.status(status).json({
          ok: false,
          error: String(error?.message || "referral-lookup-failed"),
          detail: error?.detail || null,
          joinDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
          referrerCreditInr: REFERRER_CREDIT_INR,
        });
      }
    },
  );

  app.get(
    "/api/members/:memberId/referral-credits",
    requireAccess(Access.membersRead),
    async (req, res) => {
      try {
        const memberId = String(req.params.memberId || "").trim();
        const result = await getPendingReferralCredits(memberId);
        return res.json(result);
      } catch (error) {
        const status = Number(error?.status) || 500;
        return res.status(status).json({
          ok: false,
          error: String(error?.message || "referral-credits-failed"),
        });
      }
    },
  );

  app.post(
    "/api/members/:memberId/referral",
    requireAccess(Access.membersWrite),
    async (req, res) => {
      try {
        const memberId = String(req.params.memberId || "").trim();
        const code = String(req.body?.code || "").trim();
        const result = await applyMemberReferral(memberId, code);
        await appendAuditLog(req, {
          action: "member.referral.applied",
          entityType: "member",
          entityId: memberId,
          after: {
            code: result.code,
            referrerMemberCode: result.referrer?.memberCode,
            referrerCreditInr: result.referrerCreditInr,
            admissionDiscountInr: result.admissionDiscountInr,
            duplicate: Boolean(result.duplicate),
          },
        });
        return res.status(result.duplicate ? 200 : 201).json(result);
      } catch (error) {
        const status = Number(error?.status) || 500;
        return res.status(status).json({
          ok: false,
          error: String(error?.message || "referral-apply-failed"),
          detail: error?.detail || null,
        });
      }
    },
  );
}
