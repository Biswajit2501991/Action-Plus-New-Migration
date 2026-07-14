"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddMemberWizard } from "@/features/members/add-member-wizard";
import { useGymCodes, useMembers, useSettings } from "@/hooks/use-data";
import { membersApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member } from "@/types";

export function AddMemberHost() {
  const user = useAuthStore((s) => s.user);
  const open = useUiStore((s) => s.addMemberOpen);
  const setOpen = useUiStore((s) => s.setAddMemberOpen);
  const qc = useQueryClient();
  const { data: members = [] } = useMembers();
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();

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
      return payload;
    },
    onSuccess: async (payload) => {
      toast.success(`${payload.name || "Member"} has been saved successfully`);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["members"] });
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
      onClose={() => setOpen(false)}
      settings={settings}
      members={members}
      gymCodes={gymCodes}
      currentUser={user}
      saving={createMutation.isPending}
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
