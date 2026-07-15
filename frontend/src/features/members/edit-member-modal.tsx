"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  MemberPhotoPreviewModal,
  PhotoSourcePickerModal,
} from "@/features/members/member-photo-modals";
import {
  compressMemberPhotoFile,
  isUploadableMemberPhotoPayload,
  PHOTO_TOO_LARGE_MSG,
} from "@/lib/domain/member-photo-compress";
import {
  invalidateMemberPhotoCache,
  setCachedMemberPhotoUrl,
  MEMBER_PHOTO_CACHE_EVENT,
} from "@/lib/domain/member-photo-cache";
import {
  isoDate,
  nextPaymentDateFromBillingDate,
  paymentByFromBillingDate,
} from "@/lib/domain/member-dates";
import { isMasterOwnerUser } from "@/lib/domain/permissions";
import {
  findUnlinkedDuplicateMobile,
  membersSharingNormalizedPhone,
  resolveFamilyGroupId,
} from "@/lib/domain/family-link";
import { normalizeMemberDobInput } from "@/lib/domain/members";
import { getReactivationFeeRule } from "@/lib/domain/billing";
import {
  FamilyLinkPromptModal,
  type FamilyLinkPromptState,
} from "@/features/members/family-link-prompt-modal";
import {
  ReactivationFeeModal,
  buildReactivationFeePrompt,
  type ReactivationFeePrompt,
} from "@/features/members/reactivation-fee-modal";
import { cn } from "@/lib/utils";
import { membersApi } from "@/services/api";
import type { AppSettings, AuthUser, GymCode, Member } from "@/types";

const MEDICAL_YES_NO_FIELDS: [string, string][] = [
  ["heartDisease", "Heart Disease"],
  ["cardiovascularCondition", "Cardiovascular Condition"],
  ["bloodPressure", "High/Low Blood Pressure"],
  ["arthritis", "Arthritis"],
  ["goutFamilyHistory", "Gout Family Hx of Heart Disease"],
  ["otherCondition", "Other Condition"],
];

const MEDICAL_QUESTIONNAIRE_DEFAULT = `Medical Questionnaire
1. Have you ever or do you have any of the following?
Heart Disease(Y/N). Cardiovascular Condition (Y/N). High/Low Blood Pressure (Y/N).
Arthritis (Y/N). Gout Family Hx of Heart Disease (Y/N). Other (Y/N).
2. Do you have any problems/injuries in the follow areas?(Please tick and explain to the best of your ability):
A. Knees. B. Lower Back C. Neck/Shoulders D. Hips/Pelvis Flexibility. Other: ____________
3. Are you pregnant? Yes/No__________ If so, how many week _____________________________________
4. Are you currently doing any regular physical activity, what and how many times per week__________
5. Have you had surgery in the last 5 years, if yes, when & what? _________________________________
6. Do you smoke, if yes how many per day, and for how long have you smoked? _____________________
7. Are you on any medication, if yes what and when do you take? _________________________________
8. Anything else we need to know? (If unsure write it down)_______________________________________`;

type InjuryNote = { id: string; text: string; at: string; by?: string; byId?: string };

type MedicalAnswers = Record<string, unknown> & {
  pregnant?: string;
  pregnantWeeks?: string;
  physicalActivity?: string;
  surgeryHistory?: string;
  smoking?: string;
  medication?: string;
  extraInfo?: string;
  injuryNotesLog?: InjuryNote[];
  injuries?: Record<string, unknown>;
};

type EditDraft = {
  memberId: string;
  formNo?: string | number;
  name: string;
  mobile: string;
  email: string;
  plan: string;
  status: string;
  holdDuration: string;
  billingDate: string;
  joiningDate: string;
  dob: string;
  amount: string;
  paymentMethod: string;
  nextPaymentDate: string;
  paymentBy: string;
  staff: string;
  trainerId?: string;
  assignedGymCodeId: string;
  photo?: string;
  photoUrl?: string;
  photoVersion?: number;
  hasPhoto?: boolean;
  medicalAnswers: MedicalAnswers;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDisplay(value?: string | null) {
  const key = isoDate(value);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${MONTHS[m - 1]}/${y}`;
}

function parseInjuryNotesLog(med: MedicalAnswers | null | undefined): InjuryNote[] {
  const raw = med && typeof med === "object" ? med.injuryNotesLog : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object" && String(e.text || "").trim())
    .map((e) => ({
      id: String(e.id || "").trim() || `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(e.text || "").trim(),
      at: String(e.at || "").trim() || new Date().toISOString(),
      by: String(e.by || "").trim(),
      byId: String(e.byId || "").trim(),
    }));
}

function emptyMedical(from?: Record<string, unknown> | null): MedicalAnswers {
  const base: MedicalAnswers = {
    heartDisease: "",
    cardiovascularCondition: "",
    bloodPressure: "",
    arthritis: "",
    goutFamilyHistory: "",
    otherCondition: "",
    injuries: {
      knees: false,
      lowerBack: false,
      neckShoulders: false,
      hipsPelvis: false,
      flexibility: false,
      other: "",
    },
    pregnant: "No",
    pregnantWeeks: "",
    physicalActivity: "",
    surgeryHistory: "",
    smoking: "",
    medication: "",
    extraInfo: "",
    ...(from || {}),
  };
  base.injuryNotesLog = parseInjuryNotesLog(base);
  return base;
}

function buildEditDraft(member: Member): EditDraft {
  const med =
    member.medicalAnswers && typeof member.medicalAnswers === "object"
      ? (member.medicalAnswers as Record<string, unknown>)
      : null;
  return {
    memberId: String(member.memberId || ""),
    formNo: member.formNo,
    name: String(member.name || ""),
    mobile: String(member.mobile || ""),
    email: String(member.email || ""),
    plan: String(member.plan || ""),
    status: String(member.status || "Active"),
    holdDuration: String(member.holdDuration || ""),
    billingDate: isoDate(member.billingDate) || "",
    joiningDate: isoDate(member.joiningDate) || "",
    dob: normalizeMemberDobInput(member.dob),
    amount: member.amount != null ? String(member.amount) : "",
    paymentMethod: String(member.paymentMethod || ""),
    nextPaymentDate: isoDate(member.nextPaymentDate) || nextPaymentDateFromBillingDate(member.billingDate),
    paymentBy: isoDate(member.paymentBy) || paymentByFromBillingDate(member.billingDate),
    staff: String(member.staff || member.trainerId || ""),
    trainerId: member.trainerId,
    assignedGymCodeId: String(member.assignedGymCodeId || member.assigned_gym_code_id || "").trim(),
    photo: typeof member.photo === "string" ? member.photo : "",
    photoUrl: member.photoUrl,
    photoVersion: Number(member.photoVersion || 0),
    hasPhoto: Boolean(member.hasPhoto),
    medicalAnswers: emptyMedical(med),
  };
}

function isValidPhone(mobile?: string) {
  const digits = String(mobile || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isValidEmail(email?: string) {
  const v = String(email || "").trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function ReqBadge() {
  return (
    <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
      Required
    </span>
  );
}

function ReqLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold text-amber-800">{children}</span>
      {ReqBadge()}
    </span>
  );
}

type Props = {
  member: Member;
  members?: Member[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  settings?: AppSettings | null;
  gymCodes: GymCode[];
  currentUser?: AuthUser | null;
  planOptions?: string[];
  statusOptions?: string[];
  holdOptions?: string[];
  paymentOptions?: string[];
};

export function EditMemberModal({
  member,
  members = [],
  onClose,
  onSaved,
  settings,
  gymCodes,
  currentUser,
  planOptions,
  statusOptions,
  holdOptions,
  paymentOptions,
}: Props) {
  const qc = useQueryClient();
  const isOwner = isMasterOwnerUser(currentUser);
  const canEditFormNo = isOwner;
  const [edit, setEdit] = useState<EditDraft>(() => buildEditDraft(member));
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [injuryDraft, setInjuryDraft] = useState("");
  const [injuryBusy, setInjuryBusy] = useState(false);
  const [familyPrompt, setFamilyPrompt] = useState<FamilyLinkPromptState | null>(null);
  const [reactivationPrompt, setReactivationPrompt] = useState<ReactivationFeePrompt | null>(null);
  const [pendingFamily, setPendingFamily] = useState<
    { groupId: string; primaryMemberId: string } | undefined
  >(undefined);

  useEffect(() => {
    setEdit(buildEditDraft(member));
    setInjuryDraft("");
  }, [member.memberId]);

  useEffect(() => {
    if (!edit.billingDate) return;
    const nextPay = nextPaymentDateFromBillingDate(edit.billingDate);
    const payBy = paymentByFromBillingDate(edit.billingDate);
    setEdit((prev) => ({
      ...prev,
      nextPaymentDate: nextPay,
      paymentBy: payBy,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.billingDate]);

  const plans = planOptions?.length ? planOptions : settings?.plans || [];
  const statuses = statusOptions?.length
    ? statusOptions
    : settings?.statuses || ["Active", "Hold", "Deactivated", "Cancelled"];
  const holds = holdOptions?.length
    ? holdOptions
    : settings?.holdDurations || ["1 Month", "2 Months", "3 Months"];
  const payments = paymentOptions?.length
    ? paymentOptions
    : settings?.paymentMethods || ["Cash", "UPI", "Card", "Bank"];

  const gymLabel = useCallback(
    (id?: string | null) => {
      const code = gymCodes.find((g) => String(g.id) === String(id || ""));
      if (!code) return id ? String(id) : "—";
      return code.code
        ? `${code.code}${code.name || code.label ? ` / ${code.name || code.label}` : ""}`
        : String(code.name || code.label || id);
    },
    [gymCodes],
  );

  const previewMember = useMemo(
    () =>
      ({
        ...edit,
        memberId: edit.memberId || member.memberId,
        name: edit.name || member.name,
        amount: Number(edit.amount || 0),
      }) as Member,
    [edit, member.memberId, member.name],
  );

  const req = {
    name: !String(edit.name || "").trim(),
    mobile: !String(edit.mobile || "").trim() || !isValidPhone(edit.mobile),
    dob: !isoDate(edit.dob),
    plan: !edit.plan,
    status: !edit.status,
    billingDate: !isoDate(edit.billingDate),
    amount:
      !String(edit.amount || "").trim() ||
      !/^\d+$/.test(String(edit.amount).trim()) ||
      Number(edit.amount) <= 0,
    email: String(edit.email || "").trim() ? !isValidEmail(edit.email) : false,
    paymentMethod: !String(edit.paymentMethod || "").trim(),
    holdDuration: edit.status === "Hold" && !String(edit.holdDuration || "").trim(),
  };

  const dirty = useMemo(() => {
    const billingChanged = isoDate(edit.billingDate) !== isoDate(member.billingDate);
    const amountChanged = String(edit.amount) !== String(member.amount ?? "");
    const branchChanged =
      String(edit.assignedGymCodeId || "").trim() !==
      String(member.assignedGymCodeId || member.assigned_gym_code_id || "").trim();
    const medChanged =
      JSON.stringify(edit.medicalAnswers || {}) !== JSON.stringify(member.medicalAnswers || {});
    return (
      String(edit.formNo ?? "") !== String(member.formNo ?? "") ||
      String(edit.memberId || "") !== String(member.memberId || "") ||
      String(edit.name || "") !== String(member.name || "") ||
      String(edit.email || "") !== String(member.email || "") ||
      String(edit.mobile || "") !== String(member.mobile || "") ||
      isoDate(edit.dob) !== isoDate(normalizeMemberDobInput(member.dob) || member.dob) ||
      String(edit.plan || "") !== String(member.plan || "") ||
      String(edit.status || "") !== String(member.status || "") ||
      String(edit.holdDuration || "") !== String(member.holdDuration || "") ||
      billingChanged ||
      amountChanged ||
      String(edit.paymentMethod || "") !== String(member.paymentMethod || "") ||
      branchChanged ||
      Boolean(edit.photo?.startsWith("data:")) ||
      medChanged
    );
  }, [edit, member]);

  const isInvalid = Object.values(req).some(Boolean);

  const fieldClass = (key: keyof typeof req) =>
    cn(
      "mt-1 w-full rounded-xl border px-3 py-2 text-sm",
      req[key] ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white dark:border-border dark:bg-card",
    );

  const markAllMedicalNo = () => {
    setEdit((prev) => ({
      ...prev,
      medicalAnswers: {
        ...(prev.medicalAnswers || {}),
        ...Object.fromEntries(MEDICAL_YES_NO_FIELDS.map(([key]) => [key, "N"])),
        pregnant: "No",
      },
    }));
  };

  const uploadPhoto = async (file: File) => {
    const id = String(edit.memberId || member.memberId || "").trim();
    if (!id) return;
    setPhotoBusy(true);
    try {
      const compressed = await compressMemberPhotoFile(file);
      if (!isUploadableMemberPhotoPayload(compressed)) {
        throw new Error("Unable to process photo. Please try another image.");
      }
      setEdit((prev) => ({ ...prev, photo: compressed, hasPhoto: true }));
      const res = await membersApi.uploadPhoto(id, compressed);
      const version = Number(res.photoVersion || (edit.photoVersion || 0) + 1);
      const url = String(res.photoUrl || compressed);
      invalidateMemberPhotoCache(id);
      setCachedMemberPhotoUrl(id, version, url);
      window.dispatchEvent(new CustomEvent(MEMBER_PHOTO_CACHE_EVENT));
      setEdit((prev) => ({
        ...prev,
        photo: url.startsWith("data:") ? url : String(prev.photo || "").startsWith("data:") ? String(prev.photo) : url,
        photoUrl: url,
        photoVersion: version,
        hasPhoto: true,
      }));
      toast.success("Photo uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Photo upload failed";
      toast.error(
        msg.includes("too large") || msg.includes("photo-too-large") ? PHOTO_TOO_LARGE_MSG : msg,
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    const id = String(edit.memberId || member.memberId || "").trim();
    if (!id || !confirm("Remove this member photo?")) return;
    setPhotoBusy(true);
    try {
      await membersApi.deletePhoto(id);
      invalidateMemberPhotoCache(id);
      window.dispatchEvent(new CustomEvent(MEMBER_PHOTO_CACHE_EVENT));
      setEdit((prev) => ({
        ...prev,
        photo: "",
        photoUrl: "",
        hasPhoto: false,
        photoVersion: 0,
      }));
      toast.success("Photo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const persistMedicalAnswers = async (nextMedical: MedicalAnswers) => {
    const id = String(edit.memberId || member.memberId || "").trim();
    if (!id) return;
    await membersApi.patch(id, { medicalAnswers: nextMedical } as Partial<Member>);
  };

  const addInjuryNote = async () => {
    const text = injuryDraft.trim();
    if (!text || injuryBusy) return;
    const entry: InjuryNote = {
      id: crypto.randomUUID(),
      text,
      at: new Date().toISOString(),
      by: String(currentUser?.name || currentUser?.id || "Staff").trim() || "Staff",
      byId: String(currentUser?.id || "").trim(),
    };
    const prior = parseInjuryNotesLog(edit.medicalAnswers);
    const nextMedical: MedicalAnswers = {
      ...(edit.medicalAnswers || {}),
      injuryNotesLog: [...prior, entry],
    };
    setEdit((prev) => ({ ...prev, medicalAnswers: nextMedical }));
    setInjuryDraft("");
    setInjuryBusy(true);
    try {
      await persistMedicalAnswers(nextMedical);
      toast.success("Note saved");
    } catch (err) {
      setEdit((prev) => ({
        ...prev,
        medicalAnswers: { ...(prev.medicalAnswers || {}), injuryNotesLog: prior },
      }));
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setInjuryBusy(false);
    }
  };

  const deleteInjuryNote = async (noteId: string) => {
    if (!isOwner || injuryBusy) return;
    const prior = parseInjuryNotesLog(edit.medicalAnswers);
    const nextMedical: MedicalAnswers = {
      ...(edit.medicalAnswers || {}),
      injuryNotesLog: prior.filter((n) => n.id !== noteId),
    };
    setEdit((prev) => ({ ...prev, medicalAnswers: nextMedical }));
    setInjuryBusy(true);
    try {
      await persistMedicalAnswers(nextMedical);
      toast.success("Note deleted");
    } catch (err) {
      setEdit((prev) => ({
        ...prev,
        medicalAnswers: { ...(prev.medicalAnswers || {}), injuryNotesLog: prior },
      }));
      toast.error(err instanceof Error ? err.message : "Could not delete note");
    } finally {
      setInjuryBusy(false);
    }
  };

  const buildSavePayload = (
    family?: { groupId: string; primaryMemberId: string },
  ): Partial<Member> => {
    const billing = isoDate(edit.billingDate);
    const dob = isoDate(edit.dob);
    const payload: Partial<Member> = {
      formNo: edit.formNo,
      memberId: edit.memberId,
      name: String(edit.name || "").trim(),
      mobile: String(edit.mobile || "").trim(),
      email: String(edit.email || "").trim(),
      dob,
      plan: edit.plan,
      status: edit.status,
      holdDuration: edit.status === "Hold" ? edit.holdDuration || "" : "",
      billingDate: billing,
      amount: Number(edit.amount || 0),
      paymentMethod: edit.paymentMethod,
      nextPaymentDate: nextPaymentDateFromBillingDate(billing),
      paymentBy: paymentByFromBillingDate(billing),
      assignedGymCodeId: isOwner
        ? String(edit.assignedGymCodeId || "").trim() || undefined
        : member.assignedGymCodeId || member.assigned_gym_code_id,
      medicalAnswers: edit.medicalAnswers,
      updatedAt: new Date().toISOString(),
      ...(family
        ? {
            familyGroupId: family.groupId,
            familyPrimaryMemberId: family.primaryMemberId,
          }
        : {}),
    };
    delete (payload as { photo?: string }).photo;
    return payload;
  };

  const persistSave = async (
    family?: { groupId: string; primaryMemberId: string },
    opts?: {
      skipDuplicateMobile?: boolean;
      skipReactivationFeeCheck?: boolean;
      amountOverride?: string;
      billingDateOverride?: string;
    },
  ) => {
    const id = String(member.memberId || "").trim();
    const payload = buildSavePayload(family);
    if (opts?.amountOverride != null) {
      payload.amount = Number(opts.amountOverride);
      payload.status = "Active";
      payload.holdDuration = "";
    }
    if (opts?.billingDateOverride) {
      payload.billingDate = opts.billingDateOverride;
      payload.nextPaymentDate = nextPaymentDateFromBillingDate(opts.billingDateOverride);
      payload.paymentBy = paymentByFromBillingDate(opts.billingDateOverride);
      payload.status = "Active";
      payload.holdDuration = "";
    }
    const mobileChanged =
      String(payload.mobile || "").trim() !== String(member.mobile || "").trim();

    if (mobileChanged && !opts?.skipDuplicateMobile && !family) {
      const draftMember = {
        ...member,
        ...payload,
        memberId: id,
      } as Member;
      const dup = findUnlinkedDuplicateMobile(members, draftMember);
      if (dup) {
        const matches = membersSharingNormalizedPhone(members, draftMember.mobile, id);
        setFamilyPrompt({
          mode: "edit",
          draft: draftMember,
          matches,
          selectedPrimaryId: matches[0]?.memberId || id,
        });
        return;
      }
    }

    const fromStatus = String(member.status || "").trim().toLowerCase();
    const toStatus = String(payload.status || "").trim().toLowerCase();
    const isReactivation =
      toStatus === "active" && (fromStatus === "hold" || fromStatus === "deactivated");
    if (isReactivation && !opts?.skipReactivationFeeCheck) {
      const rule = getReactivationFeeRule({
        status: member.status,
        billingDate: member.billingDate,
      });
      if (rule) {
        setPendingFamily(family);
        setReactivationPrompt(
          buildReactivationFeePrompt(
            {
              memberId: id,
              name: String(payload.name || member.name || ""),
              amount: payload.amount,
              status: member.status,
              billingDate: member.billingDate,
            },
            "Active",
            rule,
          ),
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await membersApi.patch(id, payload);
      const updated = res.member;
      if (updated?.memberId) {
        qc.setQueryData<Member[]>(["members"], (old) =>
          Array.isArray(old)
            ? old.map((row) =>
                String(row.memberId) === String(updated.memberId) ? { ...row, ...updated } : row,
              )
            : old,
        );
      }
      if (family) {
        const peers = membersSharingNormalizedPhone(members, payload.mobile, id);
        await Promise.all(
          peers.map((peer) =>
            membersApi.patch(peer.memberId, {
              familyGroupId: family.groupId,
              familyPrimaryMemberId: family.primaryMemberId,
            }),
          ),
        );
      }
      toast.success(family ? "Family linked and member updated" : "Member updated");
      setFamilyPrompt(null);
      setReactivationPrompt(null);
      setPendingFamily(undefined);
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmFamilyLink = async () => {
    if (!familyPrompt) return;
    const { draft, matches, selectedPrimaryId } = familyPrompt;
    const primaryId = String(selectedPrimaryId || "").trim();
    const allIds = [...new Set([draft.memberId, ...matches.map((m) => m.memberId)])];
    if (!primaryId || !allIds.includes(primaryId)) {
      toast.error("Choose a primary member for this family unit.");
      return;
    }
    const primaryRow =
      primaryId === draft.memberId ? draft : matches.find((x) => x.memberId === primaryId);
    const groupId = resolveFamilyGroupId(primaryRow, matches);
    await persistSave({ groupId, primaryMemberId: primaryId }, { skipDuplicateMobile: true });
  };

  const save = async () => {
    if (isInvalid || !dirty || saving) return;
    await persistSave();
  };

  const injuryLog = parseInjuryNotesLog(edit.medicalAnswers);
  const med = edit.medicalAnswers || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border bg-white shadow-xl dark:bg-card">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <h3 className="text-lg font-semibold">Edit Member — {member.name}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-muted">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPhotoPreviewOpen(true)}
              className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              aria-label="View full member photo"
              data-testid="edit-member-photo-preview-trigger"
            >
              <span className="block h-14 w-14 overflow-hidden rounded-full border border-slate-200 dark:border-border">
                <MemberAvatar
                  member={previewMember}
                  className="h-full w-full cursor-pointer hover:opacity-90"
                  imgClassName="h-full w-full object-cover"
                  textClassName="h-full w-full text-sm"
                />
              </span>
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photoBusy}
              onClick={() => setPhotoPickerOpen(true)}
            >
              {edit.hasPhoto || edit.photo ? "Change Photo" : "Upload Photo"}
            </Button>
            {edit.hasPhoto || edit.photo ? (
              <Button type="button" variant="outline" size="sm" disabled={photoBusy} onClick={() => void removePhoto()}>
                Remove
              </Button>
            ) : null}
            {photoBusy ? <span className="text-xs text-muted-foreground">Updating photo…</span> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Form Number</Label>
              <Input
                className={cn("mt-1", !canEditFormNo && "bg-slate-100 text-slate-500")}
                value={String(edit.formNo ?? "")}
                readOnly={!canEditFormNo}
                onChange={(e) => setEdit((p) => ({ ...p, formNo: e.target.value }))}
              />
            </div>
            <div>
              <Label>Member Id</Label>
              <Input
                className="mt-1"
                value={edit.memberId || ""}
                onChange={(e) => setEdit((p) => ({ ...p, memberId: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Gym Branch (Gym Code)</Label>
              {isOwner ? (
                <Select
                  className="mt-1"
                  value={String(edit.assignedGymCodeId || "")}
                  onChange={(e) => setEdit((p) => ({ ...p, assignedGymCodeId: e.target.value }))}
                  data-testid="edit-member-gym-code-select"
                >
                  <option value="">Unassigned</option>
                  {gymCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.code || ""} / ${c.name || c.label || c.branchName || ""}`.replace(/^ \/ | \/ $/g, "") || c.id}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  readOnly
                  className="mt-1 bg-slate-100 text-slate-600"
                  value={gymLabel(edit.assignedGymCodeId)}
                  data-testid="edit-member-gym-code-locked"
                />
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {isOwner
                  ? "Owner can re-assign this member to a different branch."
                  : "Only the owner can change a member's branch."}
              </p>
            </div>

            <div>
              <Label>
                <ReqLabel>Name</ReqLabel>
              </Label>
              <Input
                className={fieldClass("name")}
                value={edit.name || ""}
                onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                <ReqLabel>Mobile Number</ReqLabel>
              </Label>
              <Input
                className={fieldClass("mobile")}
                value={edit.mobile || ""}
                placeholder="e.g. 9876543210 or +919876543210"
                onChange={(e) => setEdit((p) => ({ ...p, mobile: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                <ReqLabel>Member Birthday</ReqLabel>
              </Label>
              <Input
                type="date"
                className={fieldClass("dob")}
                value={edit.dob || ""}
                onChange={(e) => setEdit((p) => ({ ...p, dob: e.target.value }))}
              />
            </div>
            <div>
              <Label>Gmail</Label>
              <Input
                type="email"
                className={fieldClass("email")}
                value={edit.email || ""}
                placeholder="example@gmail.com"
                onChange={(e) => setEdit((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                <ReqLabel>Plan</ReqLabel>
              </Label>
              <Select
                className={fieldClass("plan")}
                value={edit.plan || ""}
                onChange={(e) => setEdit((p) => ({ ...p, plan: e.target.value }))}
              >
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>
                <ReqLabel>Status</ReqLabel>
              </Label>
              <Select
                className={fieldClass("status")}
                value={String(edit.status || "Active")}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setEdit((prev) => ({
                    ...prev,
                    status: nextStatus,
                    holdDuration: nextStatus === "Hold" ? prev.holdDuration : "",
                  }));
                }}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecting a Hold Duration will automatically set Status to Hold.
              </p>
            </div>
            <div>
              <Label>Hold Duration</Label>
              <Select
                className={fieldClass("holdDuration")}
                value={edit.holdDuration || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setEdit((prev) => ({
                    ...prev,
                    holdDuration: val,
                    status: val ? "Hold" : prev.status,
                  }));
                }}
              >
                <option value="">—</option>
                {holds.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
              {req.holdDuration ? (
                <p className="mt-1 text-xs text-rose-600">Hold Duration is required when status is Hold.</p>
              ) : null}
            </div>
            <div>
              <Label>
                <ReqLabel>Billing Date</ReqLabel>
              </Label>
              <Input
                type="date"
                className={fieldClass("billingDate")}
                value={isoDate(edit.billingDate)}
                onChange={(e) => setEdit((p) => ({ ...p, billingDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                <ReqLabel>Amount (INR)</ReqLabel>
              </Label>
              <Input
                className={fieldClass("amount")}
                value={String(edit.amount ?? "")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val)) setEdit((p) => ({ ...p, amount: val }));
                }}
              />
            </div>
            <div>
              <Label>
                <ReqLabel>Payment Method</ReqLabel>
              </Label>
              <Select
                className={fieldClass("paymentMethod")}
                value={String(edit.paymentMethod || "")}
                onChange={(e) => setEdit((p) => ({ ...p, paymentMethod: e.target.value }))}
              >
                <option value="">Select</option>
                {payments.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Next Payment Date</Label>
              <Input
                readOnly
                className="mt-1 bg-slate-100 text-slate-500 dark:bg-muted"
                value={fmtDisplay(edit.nextPaymentDate)}
              />
            </div>
            <div>
              <Label>Payment By</Label>
              <Input
                readOnly
                className="mt-1 bg-slate-100 text-slate-500 dark:bg-muted"
                value={fmtDisplay(paymentByFromBillingDate(edit.billingDate) || edit.paymentBy)}
              />
            </div>
            <div>
              <Label>Staff</Label>
              <Input
                readOnly
                className="mt-1 bg-slate-100 text-slate-500 dark:bg-muted"
                value={String(edit.staff || edit.trainerId || "")}
              />
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-muted/30">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Medical Questionnaire</div>
                <button
                  type="button"
                  onClick={markAllMedicalNo}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Mark all No
                </button>
              </div>
              <div className="mb-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {String(settings?.medicalQuestionnaireTemplate || MEDICAL_QUESTIONNAIRE_DEFAULT)}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {MEDICAL_YES_NO_FIELDS.map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-border dark:bg-card">
                    <div className="mb-1 text-sm font-medium">{label}</div>
                    <div className="flex gap-3 text-sm">
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`edit-${key}`}
                          checked={String(med[key] || "") === "Y"}
                          onChange={() =>
                            setEdit((prev) => ({
                              ...prev,
                              medicalAnswers: { ...(prev.medicalAnswers || {}), [key]: "Y" },
                            }))
                          }
                        />
                        Yes
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`edit-${key}`}
                          checked={String(med[key] || "") === "N"}
                          onChange={() =>
                            setEdit((prev) => ({
                              ...prev,
                              medicalAnswers: { ...(prev.medicalAnswers || {}), [key]: "N" },
                            }))
                          }
                        />
                        No
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/20 md:col-span-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Injuries / Notes (log)</div>
                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Staff add · Owner deletes
                    </span>
                  </div>
                  <div className="mb-2 space-y-2">
                    {injuryLog.length ? (
                      injuryLog
                        .slice()
                        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
                        .map((n) => (
                          <div
                            key={n.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-amber-100 bg-white px-2.5 py-2 text-xs dark:border-border dark:bg-card"
                          >
                            <div>
                              <div className="font-medium text-slate-800 dark:text-foreground">{n.text}</div>
                              <div className="text-muted-foreground">
                                {fmtDisplay(n.at) || n.at.slice(0, 16)}
                                {n.by ? ` · ${n.by}` : ""}
                              </div>
                            </div>
                            {isOwner ? (
                              <button
                                type="button"
                                className="text-rose-600 hover:underline"
                                disabled={injuryBusy}
                                onClick={() => void deleteInjuryNote(n.id)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-amber-300 px-3 py-4 text-center text-xs text-amber-800">
                        No notes yet. Add the first entry below.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium">Add a note</div>
                    <Textarea
                      className="min-h-[72px] bg-white dark:bg-card"
                      placeholder="Type a new note, then tap Save."
                      value={injuryDraft}
                      onChange={(e) => setInjuryDraft(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        className="bg-amber-500 text-white hover:bg-amber-600"
                        disabled={!injuryDraft.trim() || injuryBusy}
                        onClick={() => void addInjuryNote()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Pregnant (Yes/No) and weeks</Label>
                  <Input
                    className="mt-1"
                    value={`${med.pregnant || "No"} ${med.pregnantWeeks || ""}`.trim()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEdit((prev) => ({
                        ...prev,
                        medicalAnswers: {
                          ...(prev.medicalAnswers || {}),
                          pregnant: val.toLowerCase().includes("yes") ? "Yes" : "No",
                          pregnantWeeks: val,
                        },
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label>Physical activity</Label>
                  <Input
                    className="mt-1"
                    value={String(med.physicalActivity || "")}
                    onChange={(e) =>
                      setEdit((prev) => ({
                        ...prev,
                        medicalAnswers: { ...(prev.medicalAnswers || {}), physicalActivity: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Surgery history</Label>
                  <Input
                    className="mt-1"
                    value={String(med.surgeryHistory || "")}
                    onChange={(e) =>
                      setEdit((prev) => ({
                        ...prev,
                        medicalAnswers: { ...(prev.medicalAnswers || {}), surgeryHistory: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Smoking details</Label>
                  <Input
                    className="mt-1"
                    value={String(med.smoking || "")}
                    onChange={(e) =>
                      setEdit((prev) => ({
                        ...prev,
                        medicalAnswers: { ...(prev.medicalAnswers || {}), smoking: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Medication details</Label>
                  <Input
                    className="mt-1"
                    value={String(med.medication || "")}
                    onChange={(e) =>
                      setEdit((prev) => ({
                        ...prev,
                        medicalAnswers: { ...(prev.medicalAnswers || {}), medication: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse justify-end gap-3 border-t px-4 py-4 sm:flex-row sm:px-6">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isInvalid || !dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <MemberPhotoPreviewModal
        open={photoPreviewOpen}
        onClose={() => setPhotoPreviewOpen(false)}
        member={previewMember}
        photoOverride={String(edit.photo || "")}
        gymLabel={gymLabel(edit.assignedGymCodeId)}
      />
      <PhotoSourcePickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        onPickFile={(file) => void uploadPhoto(file)}
        title="Member photo"
      />
      {familyPrompt ? (
        <FamilyLinkPromptModal
          prompt={familyPrompt}
          confirming={saving}
          onCancel={() => setFamilyPrompt(null)}
          onChangePrimary={(id) =>
            setFamilyPrompt((prev) => (prev ? { ...prev, selectedPrimaryId: id } : null))
          }
          onConfirm={() => void confirmFamilyLink()}
        />
      ) : null}
      <ReactivationFeeModal
        prompt={reactivationPrompt}
        saving={saving}
        onClose={() => {
          setReactivationPrompt(null);
          setPendingFamily(undefined);
        }}
        onConfirm={async (values) => {
          setReactivationPrompt(null);
          await persistSave(pendingFamily, {
            skipDuplicateMobile: true,
            skipReactivationFeeCheck: true,
            amountOverride: values.amount,
            billingDateOverride: values.billingDate,
          });
        }}
      />
    </div>
  );
}
