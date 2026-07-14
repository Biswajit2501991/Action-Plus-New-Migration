"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddMemberWizard } from "@/features/members/add-member-wizard";
import { useGymCodes, useMembers, useSettings, useVisitors } from "@/hooks/use-data";
import { membersApi, visitorsApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member, Visitor } from "@/types";

export function AddMemberHost() {
  const user = useAuthStore((s) => s.user);
  const open = useUiStore((s) => s.addMemberOpen);
  const setOpen = useUiStore((s) => s.setAddMemberOpen);
  const convertVisitor = useUiStore((s) => s.convertVisitor);
  const setConvertVisitor = useUiStore((s) => s.setConvertVisitor);
  const qc = useQueryClient();
  const { data: members = [] } = useMembers();
  const { data: visitors = [] } = useVisitors();
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();

  const close = () => {
    setOpen(false);
    setConvertVisitor(null);
  };

  const createMutation = useMutation({
    mutationFn: async ({
      member,
      familyGroupId,
      familyPrimaryMemberId,
    }: {
      member: Member;
      familyGroupId?: string;
      familyPrimaryMemberId?: string;
    }) => {
      const photo =
        typeof member.photo === "string" && member.photo.startsWith("data:") ? member.photo : "";
      const {
        photo: _photo,
        paymentHistory: _ph,
        attachments,
        ...rest
      } = member as Member & { paymentHistory?: unknown };
      const slimAttachments = Array.isArray(attachments)
        ? attachments.map((a) => {
            const row = a as Record<string, unknown>;
            const { dataUrl: _d, ...meta } = row;
            return meta;
          })
        : [];
      const payload: Member = {
        ...rest,
        ...(familyGroupId
          ? {
              familyGroupId,
              familyPrimaryMemberId,
            }
          : {}),
        ...(slimAttachments.length ? { attachments: slimAttachments } : {}),
      };
      await membersApi.bulk([payload]);
      if (photo) {
        try {
          await membersApi.uploadPhoto(payload.memberId, photo);
        } catch {
          toast.message("Member saved, but photo upload failed — you can retry from edit.");
        }
      }

      // Prod: mark source visitor Converted after successful member create.
      if (convertVisitor?.id) {
        const now = new Date().toISOString();
        const next: Visitor = {
          ...convertVisitor,
          status: "Converted",
          convertedAt: now,
          convertedMemberId: payload.memberId,
          updatedAt: now,
        };
        const restVisitors = visitors.filter((v) => v.id !== convertVisitor.id);
        await visitorsApi.bulk([next, ...restVisitors]).catch(() => {
          toast.message("Member saved, but visitor could not be marked Converted.");
        });
      }

      return payload;
    },
    onSuccess: async (payload) => {
      toast.success(
        convertVisitor
          ? `${payload.name || "Member"} saved · visitor converted`
          : `${payload.name || "Member"} has been saved successfully`,
      );
      close();
      await qc.invalidateQueries({ queryKey: ["members"] });
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => {
      const msg =
        e instanceof ApiError
          ? e.message || e.code || "Failed to save member"
          : e.message || "Failed to save member";
      toast.error(msg);
    },
  });

  if (!open) return null;

  return (
    <AddMemberWizard
      open={open}
      onClose={close}
      settings={settings}
      members={members}
      gymCodes={gymCodes}
      currentUser={user}
      saving={createMutation.isPending}
      prefillVisitor={convertVisitor}
      onSave={async (member, opts) => {
        await createMutation.mutateAsync({
          member,
          familyGroupId: opts?.familyGroupId,
          familyPrimaryMemberId: opts?.familyPrimaryMemberId,
        });
      }}
    />
  );
}
