"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWhatsapp } from "@/hooks/use-data";
import { membersApi, logsApi } from "@/services/api";
import { useAuthStore } from "@/stores";
import {
  buildWhatsAppMissingPhonePatch,
  buildWhatsAppSendMemberPatch,
  composeWhatsAppMessage,
  mergeWhatsappTemplates,
  whatsappSendAuditAction,
} from "@/lib/domain/whatsapp";
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
  const [preview, setPreview] = useState<WhatsAppPreviewState>(EMPTY_PREVIEW);
  const [sending, setSending] = useState(false);

  const templates = useMemo(
    () => mergeWhatsappTemplates(whatsappData?.templates as Record<string, unknown> | undefined),
    [whatsappData?.templates],
  );

  const closePreview = useCallback(() => setPreview(EMPTY_PREVIEW), []);

  const openPreview = useCallback(
    (member: Member, templateKey = "reminder") => {
      if (!member) return;
      const composed = composeWhatsAppMessage(member, templateKey, templates);
      setPreview({
        open: true,
        member,
        templateKey: composed.templateKey,
        message: composed.message,
      });
    },
    [templates],
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
      const composed = composeWhatsAppMessage(member, templateKey, templates);
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
  }, [preview, templates, user, qc, closePreview]);

  return {
    templates,
    preview,
    sending,
    openPreview,
    closePreview,
    confirmSend,
  };
}
