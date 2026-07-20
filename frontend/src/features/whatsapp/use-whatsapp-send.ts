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

export function useWhatsappSend() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: whatsappData } = useWhatsapp();
  const { data: settings } = useSettings();
  const [preview, setPreview] = useState<WhatsAppPreviewState>(EMPTY_PREVIEW);
  const [sending, setSending] = useState(false);

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

  const closePreview = useCallback(() => setPreview(EMPTY_PREVIEW), []);

  const resolveBodyOpts = useCallback(
    (templateKey: string) => {
      if (!isCustomTemplateHistoryKey(templateKey)) return {};
      const customBody = resolveCustomTemplateBody(customTemplates, templateKey);
      return { customBody };
    },
    [customTemplates],
  );

  const openPreview = useCallback(
    (member: Member, templateKey = "reminder") => {
      if (!member) return;
      const key = String(templateKey || "reminder").trim() || "reminder";
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
        const composed = composeWhatsAppMessage(member, key, templates, { customBody });
        setPreview({
          open: true,
          member,
          templateKey: composed.templateKey,
          message: composed.message,
        });
        return;
      }
      const composed = composeWhatsAppMessage(member, key, templates);
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
      const composed = composeWhatsAppMessage(member, templateKey, templates, bodyOpts);
      if (!composed.url || !composed.phone) {
        toast.error("Mobile number is missing.");
        closePreview();
        return;
      }

      window.open(composed.url, "_blank", "noopener,noreferrer");

      const sentAt = new Date().toISOString();
      const sentBy = String(user?.name || user?.email || user?.id || "Staff").trim() || "Staff";
      const patch = buildWhatsAppSendMemberPatch(member, composed.templateKey, {
        sentAt,
        sentBy,
      });

      await membersApi.patch(member.memberId, patch);
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
          },
        })
        .catch(() => undefined);

      toast.success("WhatsApp message opened.");
      await qc.invalidateQueries({ queryKey: ["members"] });
      closePreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record WhatsApp send");
    } finally {
      setSending(false);
    }
  }, [preview, templates, user, qc, closePreview, resolveBodyOpts]);

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
