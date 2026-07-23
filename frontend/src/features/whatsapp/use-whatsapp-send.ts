"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSettings, useWhatsapp } from "@/hooks/use-data";
import { membersApi, logsApi, whatsappApi } from "@/services/api";
import { useAuthStore } from "@/stores";
import {
  buildWhatsAppMissingPhonePatch,
  buildWhatsAppSendMemberPatch,
  composeWhatsAppMessage,
  mergeWhatsappTemplates,
  whatsappSendAuditAction,
} from "@/lib/domain/whatsapp";
import {
  paymentAmountWithReferralCredit,
  templateUsesReferralCreditInAmount,
} from "@/lib/domain/referral-billing";
import {
  type CustomTemplate,
  isCustomTemplateHistoryKey,
  isCustomTemplatesEnabled,
  resolveCustomTemplateBody,
} from "@/lib/domain/custom-templates";
import type { Member } from "@/types";
import type { WhatsAppPreviewState } from "@/features/whatsapp/message-preview-modal";

const EMPTY_PREVIEW: WhatsAppPreviewState = {
  open: false,
  member: null,
  templateKey: "",
  message: "",
};

async function fetchPendingReferralCreditInr(memberId: string): Promise<number> {
  try {
    const res = await membersApi.referralCredits(memberId);
    return Math.max(0, Number(res.pendingCreditInr) || 0);
  } catch {
    return 0;
  }
}

export function useWhatsappSend() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: whatsappData } = useWhatsapp();
  const { data: settings } = useSettings();
  const [preview, setPreview] = useState<WhatsAppPreviewState>(EMPTY_PREVIEW);
  const [sending, setSending] = useState(false);
  const [previewCreditInr, setPreviewCreditInr] = useState(0);

  const branchId = String(user?.activeBranchId || user?.gymCodeId || "").trim();
  const featureEnabled = isCustomTemplatesEnabled(
    settings as Record<string, unknown> | null | undefined,
  );

  const customQuery = useQuery({
    queryKey: ["custom-templates", branchId || "none"],
    queryFn: () => whatsappApi.customTemplates(branchId || undefined),
    enabled: Boolean(branchId) && featureEnabled,
    staleTime: 30_000,
  });

  const customTemplates = useMemo(() => {
    const list = Array.isArray(customQuery.data?.templates)
      ? (customQuery.data!.templates as CustomTemplate[])
      : [];
    return list.filter((t) => t && t.isActive !== false && t.status !== "archived");
  }, [customQuery.data]);

  const templates = useMemo(
    () => mergeWhatsappTemplates(whatsappData?.templates as Record<string, unknown> | undefined),
    [whatsappData?.templates],
  );

  const closePreview = useCallback(() => {
    setPreview(EMPTY_PREVIEW);
    setPreviewCreditInr(0);
  }, []);

  const resolveBodyOpts = useCallback(
    (templateKey: string) => {
      if (!isCustomTemplateHistoryKey(templateKey)) return {};
      const customBody = resolveCustomTemplateBody(customTemplates, templateKey);
      return { customBody };
    },
    [customTemplates],
  );

  const openPreview = useCallback(
    async (member: Member, templateKey = "reminder") => {
      if (!member) return;
      const key = String(templateKey || "reminder").trim() || "reminder";
      let pendingCredit = 0;
      if (templateUsesReferralCreditInAmount(key) && member.memberId) {
        pendingCredit = await fetchPendingReferralCreditInr(String(member.memberId));
      }
      setPreviewCreditInr(pendingCredit);

      if (isCustomTemplateHistoryKey(key)) {
        if (!featureEnabled) {
          toast.error("Custom WhatsApp templates are disabled in Settings.");
          return;
        }
        const customBody = resolveCustomTemplateBody(customTemplates, key);
        if (!customBody.trim()) {
          toast.error("This custom template was removed or is inactive.");
          return;
        }
        const composed = composeWhatsAppMessage(member, key, templates, {
          customBody,
          pendingReferralCreditInr: pendingCredit,
        });
        setPreview({
          open: true,
          member,
          templateKey: composed.templateKey,
          message: composed.message,
        });
        return;
      }
      const composed = composeWhatsAppMessage(member, key, templates, {
        pendingReferralCreditInr: pendingCredit,
      });
      setPreview({
        open: true,
        member,
        templateKey: composed.templateKey,
        message: composed.message,
      });
    },
    [templates, customTemplates, featureEnabled],
  );

  const confirmSend = useCallback(async () => {
    const member = preview.member;
    const templateKey = preview.templateKey || "reminder";
    if (!member) return;

    if (!member.mobile) {
      void membersApi
        .patch(member.memberId, buildWhatsAppMissingPhonePatch(member, templateKey))
        .then(() => qc.invalidateQueries({ queryKey: ["members"] }))
        .catch(() => undefined);
      toast.error("Mobile number is missing.");
      closePreview();
      return;
    }

    setSending(true);
    try {
      const bodyOpts = resolveBodyOpts(templateKey);
      if (isCustomTemplateHistoryKey(templateKey) && !String(bodyOpts.customBody || "").trim()) {
        toast.error("This custom template was removed or is inactive.");
        closePreview();
        return;
      }

      let pendingCredit = previewCreditInr;
      if (templateUsesReferralCreditInAmount(templateKey) && member.memberId) {
        // Re-fetch at send time so we never apply a stale preview credit.
        pendingCredit = await fetchPendingReferralCreditInr(String(member.memberId));
      }

      const composed = composeWhatsAppMessage(member, templateKey, templates, {
        ...bodyOpts,
        pendingReferralCreditInr: pendingCredit,
      });
      if (!composed.url || !composed.phone) {
        toast.error("Mobile number is missing.");
        closePreview();
        return;
      }

      window.open(composed.url, "_blank", "noopener,noreferrer");

      const sentAt = new Date().toISOString();
      const sentBy = String(user?.name || user?.email || user?.id || "Staff").trim() || "Staff";
      const planAmount = Math.max(0, Number(member.amount) || 0);
      const patch = buildWhatsAppSendMemberPatch(member, composed.templateKey, {
        sentAt,
        sentBy,
        referralCreditAppliedInr: pendingCredit,
        planAmountInr: planAmount,
        billedAmountInr:
          pendingCredit > 0
            ? paymentAmountWithReferralCredit(planAmount, pendingCredit)
            : planAmount,
      });

      await membersApi.patch(member.memberId, patch);

      if (
        templateUsesReferralCreditInAmount(composed.templateKey) &&
        pendingCredit > 0 &&
        member.memberId
      ) {
        try {
          const applied = await membersApi.applyReferralCreditsOnReminder(
            String(member.memberId),
            composed.templateKey,
          );
          if (Number(applied.appliedCreditInr) > 0) {
            toast.success(
              `WhatsApp opened · referral credit ₹${applied.appliedCreditInr} applied to reminder`,
            );
          } else {
            toast.success("WhatsApp message opened.");
          }
        } catch {
          // Message already opened — do not fail the send; credit can still apply on Payment Entry.
          toast.success("WhatsApp message opened.");
          toast.error("Could not reset pending referral credit. It may still apply on Payment Entry.");
        }
        await qc.invalidateQueries({ queryKey: ["member-referral-credits"] });
      } else {
        toast.success("WhatsApp message opened.");
      }

      void logsApi
        .create({
          action: whatsappSendAuditAction(composed.templateKey),
          entityType: "member",
          entityId: member.memberId,
          meta: {
            memberName: member.name || "",
            templateKey: composed.templateKey,
            templateLabel: composed.templateKey,
            source: "whatsapp_send",
            mobile: composed.phone,
            channel: "whatsapp",
            referralCreditAppliedInr: pendingCredit > 0 ? pendingCredit : undefined,
          },
        })
        .catch(() => undefined);

      await qc.invalidateQueries({ queryKey: ["members"] });
      closePreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record WhatsApp send");
    } finally {
      setSending(false);
    }
  }, [preview, previewCreditInr, templates, user, qc, closePreview, resolveBodyOpts]);

  return {
    templates,
    customTemplates,
    customTemplatesFeatureEnabled: featureEnabled,
    preview,
    sending,
    openPreview,
    closePreview,
    confirmSend,
  };
}
