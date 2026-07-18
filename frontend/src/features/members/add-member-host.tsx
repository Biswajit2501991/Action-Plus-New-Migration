"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddMemberWizard } from "@/features/members/add-member-wizard";
import { useGymCodes, useMembers, useSettings, useVisitors } from "@/hooks/use-data";
import { membersApi, visitorsApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import { membersSharingNormalizedPhone } from "@/lib/domain/family-link";
import {
  clearPendingMemberCreate,
  markPendingMemberCreate,
} from "@/lib/domain/member-pending-creates";
import { bulkCreateMemberWithOfflineFallback } from "@/lib/member-write";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member, Visitor } from "@/types";

async function syncFamilyPeers(
  allMembers: Member[],
  phone: string | undefined,
  groupId: string,
  primaryMemberId: string,
  excludeMemberId: string,
) {
  const peers = membersSharingNormalizedPhone(allMembers, phone, excludeMemberId);
  await Promise.all(
    peers.map((peer) =>
      membersApi.patch(peer.memberId, {
        familyGroupId: groupId,
        familyPrimaryMemberId: primaryMemberId,
      }),
    ),
  );
}

function buildCreatePayload(
  member: Member,
  familyGroupId?: string,
  familyPrimaryMemberId?: string,
): { payload: Member; photo: string } {
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
  return { payload, photo };
}

function upsertMemberInCache(
  qc: ReturnType<typeof useQueryClient>,
  payload: Member,
) {
  qc.setQueriesData<Member[]>({ queryKey: ["members"] }, (old) => {
    const list = Array.isArray(old) ? old : [];
    const id = String(payload.memberId || "").trim();
    if (!id) return list;
    const without = list.filter((m) => String(m.memberId || "").trim() !== id);
    return [payload, ...without];
  });
}

function removeMemberFromCache(
  qc: ReturnType<typeof useQueryClient>,
  memberId: string,
) {
  const id = String(memberId || "").trim();
  if (!id) return;
  qc.setQueriesData<Member[]>({ queryKey: ["members"] }, (old) => {
    const list = Array.isArray(old) ? old : [];
    return list.filter((m) => String(m.memberId || "").trim() !== id);
  });
}

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

  if (!open) return null;

  return (
    <AddMemberWizard
      open={open}
      onClose={close}
      settings={settings}
      members={members}
      gymCodes={gymCodes}
      currentUser={user}
      saving={false}
      prefillVisitor={convertVisitor}
      onSave={async (member, opts) => {
        const { payload, photo } = buildCreatePayload(
          member,
          opts?.familyGroupId,
          opts?.familyPrimaryMemberId,
        );
        const id = String(payload.memberId || "").trim();
        if (!id) throw new Error("Member ID is required");

        // Instant UX: show in list + close wizard; sync in background.
        markPendingMemberCreate(payload);
        upsertMemberInCache(qc, payload);
        toast.success(
          convertVisitor
            ? `${payload.name || "Member"} saved · visitor converted`
            : `${payload.name || "Member"} has been saved successfully`,
        );

        const sourceVisitor = convertVisitor;
        const membersSnapshot = members;
        const visitorsSnapshot = visitors;

        void (async () => {
          try {
            const { queued, result } = await bulkCreateMemberWithOfflineFallback([payload]);
            if (queued) {
              toast.message("Saved offline — will sync when online");
              // Keep pending create until flush confirms the row on the server.
              return;
            }

            if (opts?.familyGroupId && opts?.familyPrimaryMemberId) {
              await syncFamilyPeers(
                membersSnapshot,
                payload.mobile,
                opts.familyGroupId,
                opts.familyPrimaryMemberId,
                payload.memberId,
              ).catch(() => {
                toast.message("Member saved, but family link sync needs a retry.");
              });
            }

            if (photo) {
              try {
                await membersApi.uploadPhoto(payload.memberId, photo);
              } catch {
                toast.message("Member saved, but photo upload failed — you can retry from edit.");
              }
            }

            if (sourceVisitor?.id) {
              const now = new Date().toISOString();
              const next: Visitor = {
                ...sourceVisitor,
                status: "Converted",
                convertedAt: now,
                convertedMemberId: payload.memberId,
                updatedAt: now,
              };
              const restVisitors = visitorsSnapshot.filter((v) => v.id !== sourceVisitor.id);
              await visitorsApi.bulk([next, ...restVisitors]).catch(() => {
                toast.message("Member saved, but visitor could not be marked Converted.");
              });
            }

            // Keep optimistic row until list/GET confirms. Clearing here used to
            // drop members when bulk returned ok but wrote nothing / other branch.
            const written = new Set(
              (result?.written || []).map((x) => String(x || "").trim()).filter(Boolean),
            );
            if (written.has(id)) {
              try {
                await membersApi.get(id);
                clearPendingMemberCreate(id);
              } catch {
                // Saved but not visible in current branch scope — keep pending so UI retains it.
              }
            }
            void qc.invalidateQueries({ queryKey: ["members"] });
            void qc.invalidateQueries({ queryKey: ["visitors"] });
          } catch (e) {
            const status = e instanceof ApiError ? e.status : 0;
            const definitiveReject = status === 400 || status === 403 || status === 409;
            if (definitiveReject) {
              clearPendingMemberCreate(id);
              removeMemberFromCache(qc, id);
            }
            // Network / unknown errors: keep optimistic row + pending so the member
            // does not disappear; offline flush or retry can still persist it.
            const msg =
              e instanceof ApiError
                ? e.message || e.code || "Failed to save member"
                : e instanceof Error
                  ? e.message
                  : "Failed to save member";
            toast.error(msg);
            void qc.invalidateQueries({ queryKey: ["members"] });
          }
        })();
      }}
    />
  );
}
