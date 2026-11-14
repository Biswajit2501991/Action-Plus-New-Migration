"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { downloadAdmissionPdf } from "@/features/members/add-member-admission-pdf";
import {
  computeAddMemberProgress,
  countMedicalProgressAnswers,
  MEDICAL_PROGRESS_SLOTS,
} from "@/features/members/add-member-progress";
import { ageFromDob, isValidEmail, isValidPhone } from "@/lib/domain/members";
import {
  membersSharingNormalizedPhone,
  resolveFamilyGroupId,
} from "@/lib/domain/family-link";
import {
  FamilyLinkPromptModal,
  type FamilyLinkPromptState,
} from "@/features/members/family-link-prompt-modal";
import {
  addMonthsToDateKey,
  billingDateFromJoining,
  nextPaymentDateFromBillingDate,
  paymentByFromBillingDate,
  payMonthLabel,
  todayIso,
} from "@/lib/domain/member-dates";
import {
  branchCodeToken,
  buildBranchMemberId,
  gymCodeLabel,
  nextBranchFormNumber,
} from "@/lib/domain/member-id";
import { cn } from "@/lib/utils";
import {
  NEW_MEMBER_JOIN_DISCOUNT_INR,
  joinCollectAmount,
} from "@/lib/domain/referral-billing";
import { admissionFeeNote, isAdmissionAmount, isSpinCode, spinChargeInr } from "@/lib/domain/spin-admission";
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

const INJURY_KEYS: { key: keyof NonNullable<MedicalAnswers["injuries"]>; label: string }[] = [
  { key: "knees", label: "Knees" },
  { key: "lowerBack", label: "Lower Back" },
  { key: "neckShoulders", label: "Neck/Shoulders" },
  { key: "hipsPelvis", label: "Hips/Pelvis" },
  { key: "flexibility", label: "Flexibility" },
];

const MEDICAL_QUESTIONNAIRE_DEFAULT = `Medical Questionnaire
1. Have you ever or do you have any of the following?
Heart Disease(Y/N). Cardiovascular Condition (Y/N). High/Low Blood Pressure (Y/N).
Arthritis (Y/N). Gout Family Hx of Heart Disease (Y/N). Other (Y/N).
2. Do you have any problems/injuries in the follow areas?
A. Knees. B. Lower Back C. Neck/Shoulders D. Hips/Pelvis Flexibility. Other.
3. Are you pregnant? Yes/No — weeks
4. Regular physical activity
5. Surgery in the last 5 years
6. Smoking details
7. Medication details
8. Anything else we need to know?`;

const ACK_DEFAULT = `ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK
Warning: This is an important document that affects your legal rights and obligations. Please read it carefully.

I acknowledge that the activities I am about to undertake involve potential dangers, and by participating in them, I am exposed to certain risks.

I participate in the activities at my sole risk and responsibility.
I release, indemnify, and hold harmless the Fitness Centre Operator, its servants, and agents.`;

const ACK_U18_DEFAULT = `WHERE PARTICIPANT IS UNDER 18 YEARS OF AGE
(Parent/Guardian to read and sign)

I, being the parent or legal guardian, acknowledge and agree:
- I have read the entire document and understand it;
- I consent to the person named participating in the activity;
- I am aware of the risks, dangers, and obligations outlined.`;

const DRAFT_PREFIX = "apg.addMemberDraft";
const MAX_DOC_BYTES = 10 * 1024 * 1024;

type MedicalAnswers = {
  heartDisease: string;
  cardiovascularCondition: string;
  bloodPressure: string;
  arthritis: string;
  goutFamilyHistory: string;
  otherCondition: string;
  injuries: {
    knees: boolean;
    lowerBack: boolean;
    neckShoulders: boolean;
    hipsPelvis: boolean;
    flexibility: boolean;
    other: string;
  };
  pregnant: string;
  pregnantWeeks: string;
  physicalActivity: string;
  surgeryHistory: string;
  smoking: string;
  medication: string;
  extraInfo: string;
  injuryNotesLog: { id: string; text: string; at: string; by?: string }[];
};

export type AddMemberFormState = {
  formNo: string;
  name: string;
  email: string;
  dob: string;
  gender: string;
  mobile: string;
  address: string;
  staff: string;
  assignedGymCodeId: string;
  amount: string;
  plan: string;
  joiningDate: string;
  billingDate: string;
  nextPaymentDate: string;
  paymentBy: string;
  status: string;
  paymentMethod: string;
  remark: string;
  photo: string;
  attachments: { id: string; name: string; mime: string; size: number; dataUrl: string; uploadedAt: string }[];
  medicalSkipped: boolean;
  medicalAnswers: MedicalAnswers;
  ackAccepted: boolean;
  ackSignature: string;
  ackDate: string;
  parentGuardianName: string;
  parentGuardianDob: string;
  parentGuardianSignature: string;
  /** Optional Member Portal referral code (not stored on member row). */
  referredByCode: string;
};

function emptyMedical(): MedicalAnswers {
  return {
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
    injuryNotesLog: [],
  };
}

function draftKeyForUser(user?: AuthUser | null) {
  if (!user) return DRAFT_PREFIX;
  const owner =
    String(user.id || "").toLowerCase() === "owner" ||
    (Array.isArray(user.roles) && user.roles.includes("owner"));
  if (owner) return `${DRAFT_PREFIX}::owner`;
  return `${DRAFT_PREFIX}::${String(user.id || "staff").trim().toLowerCase() || "staff"}`;
}

function isOwnerUser(user?: AuthUser | null) {
  return (
    String(user?.id || "").toLowerCase() === "owner" ||
    (Array.isArray(user?.roles) && user!.roles!.includes("owner")) ||
    String(user?.staffRole || "").toLowerCase() === "master_owner"
  );
}

function defaultBranchId(user: AuthUser | null | undefined, gymCodes: GymCode[]) {
  const active = String(user?.activeBranchId || user?.gymCodeId || "").trim();
  if (!isOwnerUser(user)) return active;
  return active || String(gymCodes[0]?.id || "").trim();
}

function isPositiveInt(val: string) {
  return /^\d+$/.test(String(val).trim()) && Number(val) > 0;
}

const primaryBtn =
  "border-0 bg-[#FFC400] text-[#101A32] shadow-[0_8px_22px_rgba(255,196,0,0.38)] hover:bg-[#FFD24D] hover:text-[#101A32] dark:bg-[#FFC400] dark:text-[#101A32] dark:hover:bg-[#FFD24D]";

function fieldCls(invalid?: boolean, readOnly?: boolean) {
  return cn(
    "mt-1.5 h-11 w-full rounded-2xl border px-3.5 text-sm text-[#172238] shadow-none transition-[border-color,box-shadow] duration-200",
    "placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2",
    readOnly && "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]",
    !readOnly &&
      invalid &&
      "border-[#DC2626] bg-[#FEF2F2] text-[#991B1B] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/30",
    !readOnly &&
      !invalid &&
      "border-[#E2E8F0] bg-white/95 focus-visible:border-[#FFC400] focus-visible:ring-[#FFC400]/45",
  );
}

async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith("data:image/")) throw new Error("Choose an image file");
  if (file.size <= 900_000) return dataUrl;
  // Downscale via canvas when large
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Invalid image"));
    el.src = dataUrl;
  });
  const max = 1280;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (
    member: Member,
    opts?: {
      familyGroupId?: string;
      familyPrimaryMemberId?: string;
      referredByCode?: string;
      spinCode?: string;
      spinChargeInr?: number;
    },
  ) => Promise<void> | void;
  settings?: AppSettings | null;
  members: Member[];
  gymCodes: GymCode[];
  currentUser?: AuthUser | null;
  saving?: boolean;
  /** Prefill from Convert Visitor (identity fields only). */
  prefillVisitor?: {
    id?: string;
    fullName?: string;
    name?: string;
    email?: string;
    dob?: string;
    gender?: string;
    mobile?: string;
  } | null;
};

export function AddMemberWizard({
  open,
  onClose,
  onSave,
  settings,
  members,
  gymCodes,
  currentUser,
  saving,
  prefillVisitor,
}: Props) {
  const staffName = String(currentUser?.name || currentUser?.id || "");
  const owner = isOwnerUser(currentUser);
  const canEditFormNo = String(currentUser?.id || "").toLowerCase() === "owner";
  const defaultBranch = defaultBranchId(currentUser, gymCodes);
  const defaultPaymentMethod = settings?.paymentMethods?.[0] || "Cash";
  const planOptions = useMemo(
    () => [...new Set((settings?.plans || []).map((p) => String(p || "").trim()).filter(Boolean))],
    [settings?.plans],
  );
  const statusOptions = useMemo(
    () => [...new Set((settings?.statuses || ["Active", "Hold", "Deactivated", "Cancelled"]).map((s) => String(s || "").trim()).filter(Boolean))],
    [settings?.statuses],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [resumeStepAfterFix, setResumeStepAfterFix] = useState<number | null>(null);
  const [warn, setWarn] = useState("");
  const [familyPrompt, setFamilyPrompt] = useState<FamilyLinkPromptState | null>(null);
  const [injuryNote, setInjuryNote] = useState("");
  const [form, setForm] = useState<AddMemberFormState>(() => ({
    formNo: "",
    name: "",
    email: "",
    dob: "",
    gender: "",
    mobile: "",
    address: "",
    staff: staffName,
    assignedGymCodeId: defaultBranch,
    amount: "",
    plan: "",
    joiningDate: todayIso(),
    billingDate: todayIso(),
    nextPaymentDate: addMonthsToDateKey(todayIso(), 1),
    paymentBy: paymentByFromBillingDate(todayIso()),
    status: "Active",
    paymentMethod: defaultPaymentMethod,
    remark: "",
    photo: "",
    attachments: [],
    medicalSkipped: false,
    medicalAnswers: emptyMedical(),
    ackAccepted: false,
    ackSignature: "",
    ackDate: todayIso(),
    parentGuardianName: "",
    parentGuardianDob: "",
    parentGuardianSignature: "",
    referredByCode: "",
  }));
  const [referralHint, setReferralHint] = useState<string>("");
  const [referralError, setReferralError] = useState<string>("");
  const [referralOk, setReferralOk] = useState(false);
  const [referralLooking, setReferralLooking] = useState(false);
  const [referralReferrerLabel, setReferralReferrerLabel] = useState("");
  const [codeKind, setCodeKind] = useState<"" | "referral" | "spin">("");
  const [spinPercent, setSpinPercent] = useState(0);
  const [checkedPlanAmount, setCheckedPlanAmount] = useState("");
  const codeCheckGen = useRef(0);
  const skipNextCodeBlur = useRef(false);

  function releaseCodeCheck() {
    codeCheckGen.current += 1;
    setCodeKind("");
    setSpinPercent(0);
    setReferralOk(false);
    setReferralHint("");
    setReferralReferrerLabel("");
    setCheckedPlanAmount("");
    setReferralLooking(false);
  }

  const draftKey = draftKeyForUser(currentUser);

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, staff: staffName }));
  }, [open, staffName]);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open]);

  // Convert Visitor: clear draft and seed identity (prod convertVisitorToMember).
  useEffect(() => {
    if (!open || !prefillVisitor) return;
    const draftKeyLocal = draftKeyForUser(currentUser);
    try {
      localStorage.removeItem(draftKeyLocal);
    } catch {
      /* ignore */
    }
    const name = String(prefillVisitor.fullName || prefillVisitor.name || "").trim();
    setStep(1);
    setWarn("");
    setForm((f) => ({
      ...f,
      name,
      email: String(prefillVisitor.email || "").trim(),
      dob: String(prefillVisitor.dob || "").slice(0, 10),
      gender: String(prefillVisitor.gender || "").trim(),
      mobile: String(prefillVisitor.mobile || "").trim(),
      staff: staffName,
      ackSignature: name,
    }));
  }, [open, prefillVisitor, currentUser, staffName]);

  useEffect(() => {
    if (!open) return;
    setForm((f) => {
      if (owner) {
        const next = String(f.assignedGymCodeId || "").trim() || defaultBranch;
        return next === f.assignedGymCodeId ? f : { ...f, assignedGymCodeId: next };
      }
      const locked = String(currentUser?.gymCodeId || currentUser?.activeBranchId || defaultBranch).trim();
      return locked === f.assignedGymCodeId ? f : { ...f, assignedGymCodeId: locked };
    });
  }, [open, owner, currentUser?.gymCodeId, currentUser?.activeBranchId, defaultBranch]);

  useEffect(() => {
    if (!open) return;
    if (prefillVisitor) return; // convert flow skips restoring local draft
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { step?: number; form?: Partial<AddMemberFormState> };
      if (parsed?.form) {
        setForm((f) => {
          const merged = {
            ...f,
            ...parsed.form,
            staff: staffName || parsed.form?.staff || f.staff,
            referredByCode: String(parsed.form?.referredByCode || f.referredByCode || ""),
          };
          // Staff branch is locked — never let a stale draft wipe assignedGymCodeId
          // (that previously caused silent create failures / disappearing members).
          if (!owner) {
            const locked = String(
              currentUser?.gymCodeId || currentUser?.activeBranchId || defaultBranch,
            ).trim();
            if (locked) merged.assignedGymCodeId = locked;
          }
          return merged;
        });
        setStep(Math.max(1, Math.min(5, Number(parsed.step) || 1)));
      }
    } catch {
      /* ignore */
    }
  }, [
    open,
    draftKey,
    staffName,
    prefillVisitor,
    owner,
    currentUser?.gymCodeId,
    currentUser?.activeBranchId,
    defaultBranch,
  ]);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      const nextName = String(prev.name || "");
      if (String(prev.ackSignature || "") === nextName) return prev;
      return { ...prev, ackSignature: nextName };
    });
  }, [open, form.name]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ step, form }));
    } catch {
      /* ignore */
    }
  }, [open, step, form, draftKey]);

  useEffect(() => {
    if (!open) return;
    const branchId = String(form.assignedGymCodeId || "").trim();
    if (!branchId) return;
    let cancelled = false;
    const yearSuffix = String(new Date().getFullYear()).slice(-2);
    const token = branchCodeToken(gymCodes, branchId);
    // Local fallback first (active members only), then server (skips deleted codes).
    let next = nextBranchFormNumber(members, branchId);
    for (let i = 0; i < 1000; i += 1) {
      const candidate = buildBranchMemberId(next, yearSuffix, token);
      if (!members.some((m) => String(m.memberId || "").trim() === candidate)) break;
      next += 1;
    }
    const nextStr = String(next);
    setForm((f) => (f.formNo === nextStr ? f : { ...f, formNo: nextStr }));

    void (async () => {
      try {
        const { membersApi } = await import("@/services/api");
        const res = await membersApi.nextFormNumber(branchId, {
          branchToken: token,
          yearSuffix,
        });
        if (cancelled || !res?.formNo) return;
        const serverStr = String(res.formNo);
        setForm((f) => (f.formNo === serverStr ? f : { ...f, formNo: serverStr }));
      } catch {
        /* keep local suggestion */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, members, form.assignedGymCodeId, gymCodes]);

  useEffect(() => {
    if (!open || !form.joiningDate) return;
    const bd = billingDateFromJoining(form.joiningDate);
    const nextPay = nextPaymentDateFromBillingDate(bd);
    const payBy = paymentByFromBillingDate(bd);
    setForm((f) => {
      if (f.billingDate === bd && f.nextPaymentDate === nextPay && f.paymentBy === payBy) return f;
      return { ...f, billingDate: bd, nextPaymentDate: nextPay, paymentBy: payBy };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.joiningDate]);

  useEffect(() => {
    if (!open || !form.billingDate) return;
    const nextPay = nextPaymentDateFromBillingDate(form.billingDate);
    const payBy = paymentByFromBillingDate(form.billingDate);
    setForm((f) => {
      if (f.nextPaymentDate === nextPay && f.paymentBy === payBy) return f;
      return { ...f, nextPaymentDate: nextPay, paymentBy: payBy };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.billingDate]);

  const req1 = {
    formNo: !form.formNo,
    assignedGymCodeId: !String(form.assignedGymCodeId || "").trim(),
    name: !form.name.trim(),
    email: !form.email.trim() || !isValidEmail(form.email),
    dob: !form.dob || Number.isNaN(new Date(form.dob).getTime()) || new Date(form.dob) > new Date(),
    gender: !form.gender,
    mobile: !form.mobile.trim() || !isValidPhone(form.mobile),
    address: !form.address.trim(),
  };
  const req2 = {
    staff: !form.staff.trim(),
    amount: !form.amount || !isPositiveInt(form.amount),
    plan: !form.plan,
    joiningDate: !form.joiningDate,
    billingDate: !form.billingDate,
    paymentBy: !form.paymentBy,
    status: !form.status,
  };
  const req3 = { paymentMethod: !form.paymentMethod };
  const isMinor = ageFromDob(form.dob) !== null && (ageFromDob(form.dob) as number) < 18;
  async function downloadAdmission() {
    if (!form.name.trim()) return;
    try {
      await downloadAdmissionPdf({
        name: form.name,
        formNo: form.formNo,
        email: form.email,
        dob: form.dob,
        gender: form.gender,
        mobile: form.mobile,
        address: form.address,
        branch: gymCodeLabel(gymCodes, form.assignedGymCodeId),
        staff: form.staff,
        amount: form.amount,
        plan: form.plan,
        joiningDate: form.joiningDate,
        billingDate: form.billingDate,
        nextPaymentDate: form.nextPaymentDate,
        paymentBy: form.paymentBy,
        status: form.status,
        paymentMethod: form.paymentMethod,
        remark: form.remark,
        photoDataUrl: form.photo,
        medicalSkipped: form.medicalSkipped,
        medical: form.medicalAnswers,
        acknowledgement: String(settings?.acknowledgementTemplate || ACK_DEFAULT),
        ackAccepted: form.ackAccepted,
        ackDate: form.ackDate,
        signature: form.name.trim(),
        isMinor,
        under18Acknowledgement: String(settings?.acknowledgementUnder18Template || ACK_U18_DEFAULT),
        parentGuardianName: form.parentGuardianName,
        parentGuardianDob: form.parentGuardianDob,
        parentGuardianSignature: form.parentGuardianSignature,
      });
    } catch (err) {
      setWarn(err instanceof Error ? err.message : "Could not download the admission PDF.");
    }
  }
  const req5 = {
    ackAccepted: !form.ackAccepted,
    ackSignature: !String(form.name || "").trim(),
    parentGuardianName: isMinor && !String(form.parentGuardianName || "").trim(),
    parentGuardianSignature: isMinor && !String(form.parentGuardianSignature || "").trim(),
  };

  const sectionCompletion = useMemo(() => {
    const yesNo = form.medicalAnswers as unknown as Record<string, unknown>;
    const hasMedical =
      MEDICAL_YES_NO_FIELDS.some(([k]) => String(yesNo[k] || "").trim()) ||
      form.medicalAnswers.injuryNotesLog.length > 0 ||
      Boolean(form.medicalAnswers.extraInfo?.trim()) ||
      Boolean(form.medicalAnswers.physicalActivity?.trim()) ||
      Boolean(form.medicalAnswers.surgeryHistory?.trim()) ||
      Boolean(form.medicalAnswers.smoking?.trim()) ||
      Boolean(form.medicalAnswers.medication?.trim()) ||
      Boolean(form.medicalAnswers.pregnantWeeks?.trim());
    return {
      memberDetailsDone: !Object.values(req1).some(Boolean),
      membershipDetailsDone: !Object.values(req2).some(Boolean),
      paymentDetailsDone: !Object.values(req3).some(Boolean),
      medicalDone: Boolean(form.medicalSkipped || hasMedical),
      acknowledgementDone: !Object.values(req5).some(Boolean),
    };
  }, [req1, req2, req3, req5, form.medicalAnswers, form.medicalSkipped]);

  const missingSummary = useMemo(() => {
    const lines: string[] = [];
    if (req1.formNo) lines.push("Form Number");
    if (req1.assignedGymCodeId) lines.push("Gym Branch");
    if (req1.name) lines.push("Full Name");
    if (req1.email) lines.push("Valid Gmail");
    if (req1.dob) lines.push("Valid Member Birthday");
    if (req1.gender) lines.push("Gender");
    if (req1.mobile) lines.push("Valid Mobile");
    if (req1.address) lines.push("Address");
    if (req2.amount) lines.push("Amount");
    if (req2.plan) lines.push("Plan");
    if (req2.joiningDate) lines.push("Joining Date");
    if (req2.billingDate) lines.push("Billing Date");
    if (req2.status) lines.push("Status");
    if (req3.paymentMethod) lines.push("Payment Method");
    if (req5.ackAccepted) lines.push("Acknowledgement Accepted");
    if (req5.parentGuardianName) lines.push("Parent/Guardian Name");
    if (req5.parentGuardianSignature) lines.push("Parent/Guardian Signature");
    return lines;
  }, [req1, req2, req3, req5]);

  const scrollTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const focusField = (id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      try {
        (el as HTMLElement | null)?.focus?.();
      } catch {
        /* ignore */
      }
    });
  };
  const goToStepAndFocus = (target: number, fieldId: string, message: string, resume: number | null = null) => {
    setWarn(message);
    setResumeStepAfterFix(resume);
    setStep(target);
    scrollTop();
    window.setTimeout(() => focusField(fieldId), 120);
  };

  const firstInvalid = (stepNo: number) => {
    if (stepNo === 1) {
      if (req1.formNo) return "add-member-formNo";
      if (req1.assignedGymCodeId) return "add-member-gym-code";
      if (req1.name) return "add-member-name";
      if (req1.email) return "add-member-email";
      if (req1.dob) return "add-member-dob";
      if (req1.gender) return "add-member-gender";
      if (req1.mobile) return "add-member-mobile";
      if (req1.address) return "add-member-address";
    }
    if (stepNo === 2) {
      if (req2.amount) return "add-member-amount";
      if (req2.plan) return "add-member-plan";
      if (req2.joiningDate) return "add-member-joiningDate";
      if (req2.billingDate) return "add-member-billingDate";
      if (req2.status) return "add-member-status";
    }
    if (stepNo === 3 && req3.paymentMethod) return "add-member-paymentMethod";
    if (stepNo === 5) {
      if (req5.ackAccepted) return "add-member-ackAccepted";
      if (req5.parentGuardianName) return "add-member-parentGuardianName";
      if (req5.parentGuardianSignature) return "add-member-parentGuardianSignature";
    }
    return "";
  };

  const next = () => {
    setWarn("");
    if (step === 1 && Object.values(req1).some(Boolean)) {
      goToStepAndFocus(1, firstInvalid(1), "Please fill all required fields in Step 1.");
      return;
    }
    if (step === 2 && Object.values(req2).some(Boolean)) {
      goToStepAndFocus(2, firstInvalid(2), "Please fill all required fields in Step 2.");
      return;
    }
    if (step === 3 && Object.values(req3).some(Boolean)) {
      goToStepAndFocus(3, firstInvalid(3), "Please fill all required fields in Step 3.");
      return;
    }
    if (resumeStepAfterFix && step < resumeStepAfterFix) {
      setStep(resumeStepAfterFix);
      setResumeStepAfterFix(null);
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const jumpToStep = (target: number) => {
    if (saving || target < 1 || target > 5 || target === step) return;
    setStep(target);
    scrollTop();
  };

  const buildMemberPayload = (): Member | null => {
    setWarn("");
    if (
      Object.values(req1).some(Boolean) ||
      Object.values(req2).some(Boolean) ||
      Object.values(req3).some(Boolean) ||
      Object.values(req5).some(Boolean)
    ) {
      if (Object.values(req1).some(Boolean)) goToStepAndFocus(1, firstInvalid(1), "Please fill all required fields.", 5);
      else if (Object.values(req2).some(Boolean)) goToStepAndFocus(2, firstInvalid(2), "Please fill all required fields.", 5);
      else if (Object.values(req3).some(Boolean)) goToStepAndFocus(3, firstInvalid(3), "Please fill all required fields.", 5);
      else goToStepAndFocus(5, firstInvalid(5), "Please fill all required fields.");
      return null;
    }
    const trimmedEmail = String(form.email || "").trim().toLowerCase();
    if (members.some((m) => String(m.email || "").trim().toLowerCase() === trimmedEmail)) {
      goToStepAndFocus(1, "add-member-email", "A member with this email already exists. Please use a different Gmail.", 5);
      return null;
    }
    const yearSuffix = String(new Date().getFullYear()).slice(-2);
    const token = branchCodeToken(gymCodes, form.assignedGymCodeId);
    const memberId = buildBranchMemberId(form.formNo, yearSuffix, token);
    if (members.some((m) => String(m.memberId || "").trim() === memberId)) {
      goToStepAndFocus(1, "add-member-formNo", "Generated member ID already exists. Please change Form Number.", 5);
      return null;
    }
    const now = new Date().toISOString();
    const { referredByCode: _refCode, ...memberFields } = form;
    return {
      ...memberFields,
      ackSignature: String(form.name || "").trim(),
      memberId,
      formNo: Number(form.formNo),
      amount: Number(form.amount || 0),
      nextPaymentDate: form.nextPaymentDate || nextPaymentDateFromBillingDate(form.billingDate),
      paymentBy: form.paymentBy || paymentByFromBillingDate(form.billingDate),
      payMonth: payMonthLabel(addMonthsToDateKey(form.billingDate, 1)),
      staff: staffName || form.staff,
      updatedBy: staffName || currentUser?.id,
      createdAt: now,
      updatedAt: now,
      billingDateUpdatedAt: now,
    } as unknown as Member;
  };

  const persistSave = async (member: Member, family?: { groupId: string; primaryMemberId: string }) => {
    const code = String(form.referredByCode || "").trim();
    if (code && !referralOk) {
      setWarn(referralError || "Check the code before saving. Only one code can be used.");
      return;
    }
    if (code && String(form.amount).trim() !== checkedPlanAmount) {
      setWarn("Enter the plan fee, then check the code again.");
      return;
    }
    try {
      await onSave(
        member,
        {
          ...(family
            ? { familyGroupId: family.groupId, familyPrimaryMemberId: family.primaryMemberId }
            : {}),
          ...(code && codeKind === "referral" ? { referredByCode: code } : {}),
          ...(code && codeKind === "spin"
            ? { spinCode: code, spinChargeInr: spinChargeInr(checkedPlanAmount, spinPercent) }
            : {}),
        },
      );
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setFamilyPrompt(null);
      onClose();
      setStep(1);
      setWarn("");
    } catch (err) {
      const detail =
        err && typeof err === "object" && "detail" in err
          ? (err as { detail?: { suggestedFormNo?: number } }).detail
          : null;
      if (detail?.suggestedFormNo) {
        setForm((f) => ({ ...f, formNo: String(detail.suggestedFormNo) }));
      }
      const message = err instanceof Error ? err.message : "Failed to save member";
      setWarn(message);
      setFamilyPrompt(null);
    }
  };

  const save = async () => {
    const draft = buildMemberPayload();
    if (!draft) return;
    const matches = membersSharingNormalizedPhone(members, draft.mobile, draft.memberId);
    if (matches.length) {
      setFamilyPrompt({
        mode: "add",
        draft,
        matches,
        selectedPrimaryId: matches[0]?.memberId || draft.memberId,
      });
      return;
    }
    await persistSave(draft);
  };

  const confirmFamilyLink = async () => {
    if (!familyPrompt) return;
    const { draft, matches, selectedPrimaryId } = familyPrompt;
    const primaryId = String(selectedPrimaryId || "").trim();
    const allIds = [...new Set([draft.memberId, ...matches.map((m) => m.memberId)])];
    if (!primaryId || !allIds.includes(primaryId)) {
      setWarn("Choose a primary member for this family unit.");
      return;
    }
    const primaryRow =
      primaryId === draft.memberId ? draft : matches.find((x) => x.memberId === primaryId);
    const groupId = resolveFamilyGroupId(primaryRow, matches);
    await persistSave(draft, { groupId, primaryMemberId: primaryId });
  };

  if (!open) return null;

  const progress = computeAddMemberProgress({
    req1,
    req2,
    req3,
    req5,
    medicalDone: sectionCompletion.medicalDone,
    medicalAnswered: countMedicalProgressAnswers(form.medicalAnswers),
    medicalSlots: MEDICAL_PROGRESS_SLOTS,
  });
  const sectionChips = progress.sections;

  const stepTitle = sectionChips[step - 1]?.label || "Member Details";
  const typedName = form.name.trim();
  const screenTitle = typedName ? `${typedName} - Add New Member` : "Add New Member";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden overscroll-none bg-[#101A32]/55 p-0 backdrop-blur-md sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none border border-white/50 bg-[#F5F7FB]/90 shadow-[0_28px_80px_rgba(16,26,50,0.32)] backdrop-blur-xl sm:h-auto sm:max-h-[92vh] sm:rounded-[24px]">
        <div className="sticky top-0 z-20 border-b border-white/50 bg-white/75 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
                Action Plus Gym
              </p>
              <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-[#101A32]" title={screenTitle}>
                {screenTitle}
              </h3>
              <p className="mt-0.5 text-sm text-[#64748B]">
                Step {step} of 5 · {stepTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-[#172238] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC400]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#64748B]">
              <span>{progress.complete ? "Registration complete" : "Registration progress"}</span>
              <span className={cn("tabular-nums", progress.complete ? "text-[#16A34A]" : "text-[#101A32]")}>
                {progress.complete ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    100%
                  </span>
                ) : (
                  `${progress.percent}%`
                )}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-[#E5EAF1]"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Registration progress"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
                  progress.complete
                    ? "bg-[#16A34A] shadow-[0_0_18px_rgba(22,163,74,0.55)]"
                    : "bg-[#FFC400] shadow-[0_0_18px_rgba(255,196,0,0.7)]",
                )}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <ol className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sectionChips.map((item, index) => {
              const active = step === index + 1;
              return (
                <li key={item.label} className="min-w-[158px] shrink-0">
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    disabled={Boolean(saving)}
                    onClick={() => jumpToStep(index + 1)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC400] disabled:cursor-not-allowed",
                      item.done && "border-[#16A34A]/30 bg-[#16A34A]/10",
                      active && !item.done && "border-[#FFC400] bg-[#FFC400]/18 shadow-[0_6px_16px_rgba(255,196,0,0.18)]",
                      !active && !item.done && "border-[#E2E8F0] bg-white/80",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                        item.done && "bg-[#16A34A] text-white",
                        active && !item.done && "bg-[#FFC400] text-[#101A32]",
                        !active && !item.done && "bg-[#E5EAF1] text-[#64748B]",
                      )}
                    >
                      {item.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                    </span>
                    <span className="text-xs font-medium text-[#172238]">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-[#64748B]">
            <span className="font-semibold text-[#DC2626]">*</span> Required fields
          </p>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-auto bg-[#F5F7FB]/70 px-4 text-[#172238] sm:px-6",
            step === 4 || step === 5 ? "pb-52 sm:pb-28" : "pb-40 sm:pb-8",
          )}
        >
          {warn ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warn}</div>
          ) : null}
          {step === 5 && missingSummary.length > 0 ? (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              Missing required fields: {missingSummary.join(", ")}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid grid-cols-1 gap-4 rounded-[20px] border border-white/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(16,26,50,0.06)] sm:gap-5 lg:grid-cols-2">
              <div>
                <Label>
                  Form Number <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-formNo"
                  className={fieldCls(req1.formNo, !canEditFormNo)}
                  value={form.formNo}
                  readOnly={!canEditFormNo}
                  inputMode="numeric"
                  onChange={(e) => setForm({ ...form, formNo: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Full Name <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-name"
                  className={fieldCls(req1.name)}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Gmail <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-email"
                  type="email"
                  placeholder="example@gmail.com"
                  className={fieldCls(req1.email)}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Member Birthday <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-dob"
                  type="date"
                  className={fieldCls(req1.dob)}
                  value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Gender <span className="text-rose-600">*</span>
                </Label>
                <Select
                  id="add-member-gender"
                  className={fieldCls(req1.gender)}
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">Select gender</option>
                  {(settings?.genders || ["Male", "Female", "Other"]).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>
                  Mobile Number <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-mobile"
                  inputMode="numeric"
                  placeholder="e.g. 9876543210 or +919876543210"
                  className={fieldCls(req1.mobile)}
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </div>
              <div className="lg:col-span-2">
                <Label>
                  Address <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-address"
                  className={fieldCls(req1.address)}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="lg:col-span-2">
                <Label>
                  Gym Branch (Gym Code) <span className="text-rose-600">*</span>
                </Label>
                {owner ? (
                  <Select
                    id="add-member-gym-code"
                    className={fieldCls(req1.assignedGymCodeId)}
                    value={form.assignedGymCodeId}
                    onChange={(e) => setForm({ ...form, assignedGymCodeId: e.target.value })}
                  >
                    <option value="">Select a branch…</option>
                    {gymCodes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} / {c.name || c.label || "Branch"}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id="add-member-gym-code-locked"
                    readOnly
                    className={fieldCls(false, true)}
                    value={gymCodeLabel(gymCodes, form.assignedGymCodeId)}
                  />
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {owner
                    ? "Owner can pick any branch. Default = active/HQ."
                    : "Locked to your assigned branch. Only owner can move members between branches."}
                </p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid grid-cols-1 gap-4 rounded-[20px] border border-white/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(16,26,50,0.06)] sm:grid-cols-2 sm:gap-5">
              <div>
                <Label>Staff (logged in)</Label>
                <Input className={fieldCls(false, true)} value={form.staff} readOnly />
              </div>
              <div>
                <Label>
                  Amount (INR) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-amount"
                  inputMode="numeric"
                  placeholder="Enter plan fee"
                  readOnly={referralOk || referralLooking}
                  className={fieldCls(req2.amount, referralOk || referralLooking)}
                  value={form.amount}
                  onChange={(e) => {
                    if (referralOk || referralLooking) return;
                    const val = e.target.value;
                    if (/^\d*$/.test(val)) setForm({ ...form, amount: val });
                  }}
                />
                {referralOk ? (
                  <button
                    type="button"
                    className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      skipNextCodeBlur.current = document.activeElement?.id === "add-member-referredByCode";
                    }}
                    onClick={() => {
                      releaseCodeCheck();
                      setReferralError("Enter the plan fee, then check the code again.");
                      document.getElementById("add-member-amount")?.focus();
                    }}
                  >
                    Change amount
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">This is the plan fee.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label>Referred by code or Spin code (optional)</Label>
                <Input
                  id="add-member-referredByCode"
                  className={fieldCls(false)}
                  placeholder="One code only"
                  value={form.referredByCode}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setForm({ ...form, referredByCode: next });
                    releaseCodeCheck();
                    setReferralError("");
                  }}
                  onBlur={() => {
                    if (skipNextCodeBlur.current) {
                      skipNextCodeBlur.current = false;
                      return;
                    }
                    const code = String(form.referredByCode || "").trim();
                    const planAmount = String(form.amount || "").trim();
                    releaseCodeCheck();
                    const gen = codeCheckGen.current;
                    if (!code) {
                      setReferralError("");
                      return;
                    }
                    if (!isAdmissionAmount(planAmount)) {
                      setReferralError("Enter the correct amount first.");
                      return;
                    }
                    setReferralLooking(true);
                    if (isSpinCode(code)) {
                      void membersApi
                        .lookupSpinCoupon(code)
                        .then((res) => {
                          if (gen !== codeCheckGen.current) return;
                          const coupon = res.coupon;
                          if (!coupon || coupon.status !== "issued" || !(coupon.discount > 0)) {
                            setReferralError(
                              coupon?.status === "redeemed"
                                ? "This Spin code was already used."
                                : coupon?.status === "expired"
                                  ? "This Spin code has expired."
                                  : "This Spin code cannot be used.",
                            );
                            return;
                          }
                          const charge = spinChargeInr(planAmount, coupon.discount);
                          setCheckedPlanAmount(planAmount);
                          setCodeKind("spin");
                          setSpinPercent(coupon.discount);
                          setReferralOk(true);
                          setReferralError("");
                          setReferralHint(admissionFeeNote(planAmount, charge));
                        })
                        .catch(() => {
                          if (gen !== codeCheckGen.current) return;
                          setReferralError("Code not found.");
                        })
                        .finally(() => {
                          if (gen === codeCheckGen.current) setReferralLooking(false);
                        });
                      return;
                    }
                    void membersApi
                      .lookupReferral(code)
                      .then((res) => {
                        if (gen !== codeCheckGen.current) return;
                        const label = `${res.referrer?.fullName || res.referrer?.memberCode || "Member"} (${res.referrer?.status || "Active"})`;
                        setCheckedPlanAmount(planAmount);
                        setCodeKind("referral");
                        setReferralReferrerLabel(label);
                        setReferralOk(true);
                        setReferralError("");
                        setReferralHint(
                          `Referrer: ${label}.\n${admissionFeeNote(planAmount, joinCollectAmount(planAmount, true))}`,
                        );
                      })
                      .catch((e: Error) => {
                        if (gen !== codeCheckGen.current) return;
                        const msg = String(e?.message || "");
                        setReferralError(
                          msg === "referral-code-not-found" || msg.includes("404")
                            ? "Code not found."
                            : msg === "referrer-not-eligible"
                              ? "Referrer must be Active or Hold"
                              : msg || "Invalid referral code",
                        );
                      })
                      .finally(() => {
                        if (gen === codeCheckGen.current) setReferralLooking(false);
                      });
                  }}
                />
                {referralLooking ? (
                  <p className="mt-1 text-xs text-muted-foreground">Checking code…</p>
                ) : null}
                {referralHint ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-emerald-700 dark:text-emerald-300">{referralHint}</p>
                ) : null}
                {referralError ? (
                  <p className="mt-1 text-xs text-rose-600">{referralError}</p>
                ) : null}
                {!form.referredByCode && form.amount ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Amount is the plan fee. One code only. After it is accepted, Amount locks and the amount to collect is shown separately. A referral takes ₹
                    {NEW_MEMBER_JOIN_DISCOUNT_INR} off that collect amount. A Spin code takes its percent off.
                  </p>
                ) : null}
              </div>
              <div>
                <Label>
                  Plan <span className="text-rose-600">*</span>
                </Label>
                <Select
                  id="add-member-plan"
                  className={fieldCls(req2.plan)}
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                >
                  <option value="">Select plan</option>
                  {planOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>
                  Joining Date <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-joiningDate"
                  type="date"
                  className={fieldCls(req2.joiningDate)}
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Billing Date <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="add-member-billingDate"
                  type="date"
                  className={fieldCls(req2.billingDate)}
                  value={form.billingDate}
                  onChange={(e) => setForm({ ...form, billingDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Next Payment Date</Label>
                <Input
                  type="date"
                  className={fieldCls(false, true)}
                  value={form.nextPaymentDate || nextPaymentDateFromBillingDate(form.billingDate)}
                  readOnly
                />
              </div>
              <div>
                <Label>Payment By</Label>
                <Input
                  type="date"
                  className={fieldCls(false, true)}
                  value={form.paymentBy || paymentByFromBillingDate(form.billingDate)}
                  readOnly
                />
              </div>
              <div>
                <Label>
                  Status <span className="text-rose-600">*</span>
                </Label>
                <Select
                  id="add-member-status"
                  className={fieldCls(req2.status)}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-4 rounded-[20px] border border-white/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(16,26,50,0.06)] md:grid-cols-2">
              <div>
                <Label>
                  Payment Mode <span className="text-rose-600">*</span>
                </Label>
                <Select
                  id="add-member-paymentMethod"
                  className={fieldCls(req3.paymentMethod)}
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                >
                  {(settings?.paymentMethods || ["Cash", "UPI", "Card", "Bank"]).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Member Photo</Label>
                <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white/95 p-3">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-semibold text-[#101A32]">
                    {form.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (form.name || "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#172238] shadow-sm transition hover:border-[#FFC400] focus-within:ring-2 focus-within:ring-[#FFC400]/50">
                    {form.photo ? "Change Photo" : "Upload Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const compressed = await compressImageFile(file);
                          setForm((f) => ({ ...f, photo: compressed }));
                        } catch (err) {
                          setWarn(err instanceof Error ? err.message : "Could not upload photo");
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <Label>Upload Documents (up to 10MB each)</Label>
                <label className="mt-1.5 flex cursor-pointer flex-col gap-1 rounded-2xl border border-dashed border-[#E2E8F0] bg-white/95 px-4 py-4 text-sm text-[#172238] shadow-sm transition hover:border-[#FFC400] focus-within:ring-2 focus-within:ring-[#FFC400]/50">
                  <span className="font-medium">Add Document</span>
                  <span className="text-xs text-[#64748B]">Up to 10MB each. Tap a file below to remove it.</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      const valid = files.filter((f) => f.size <= MAX_DOC_BYTES);
                      if (valid.length !== files.length) setWarn("Some files were dropped — too large (maximum 10 MB each).");
                      const entries = await Promise.all(
                        valid.map(
                          (file) =>
                            new Promise<{
                              id: string;
                              name: string;
                              mime: string;
                              size: number;
                              dataUrl: string;
                              uploadedAt: string;
                            } | null>((resolve) => {
                              const r = new FileReader();
                              r.onload = () =>
                                resolve({
                                  id: crypto.randomUUID(),
                                  name: file.name,
                                  mime: file.type || "application/octet-stream",
                                  size: file.size,
                                  dataUrl: String(r.result || ""),
                                  uploadedAt: new Date().toISOString(),
                                });
                              r.onerror = () => resolve(null);
                              r.readAsDataURL(file);
                            }),
                        ),
                      );
                      setForm((f) => ({
                        ...f,
                        attachments: [...(f.attachments || []), ...entries.filter(Boolean) as NonNullable<(typeof entries)[number]>[]],
                      }));
                    }}
                  />
                </label>
                {(form.attachments || []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.attachments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs text-[#172238] hover:border-[#DC2626] hover:bg-[#FEF2F2]"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            attachments: (f.attachments || []).filter((x) => x.id !== a.id),
                          }))
                        }
                      >
                        {a.name} ✕
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <Label>Remark</Label>
                <Textarea
                  className={cn(fieldCls(false), "h-auto min-h-[96px]")}
                  rows={3}
                  placeholder="Enter a short note"
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 rounded-[20px] border border-white/80 bg-white/92 p-4 pb-6 shadow-[0_10px_30px_rgba(16,26,50,0.06)]">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">
                {String(settings?.medicalQuestionnaireTemplate || MEDICAL_QUESTIONNAIRE_DEFAULT)}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full border border-[#16A34A]/30 bg-[#16A34A]/10 px-3 py-1.5 text-xs font-semibold text-[#166534] transition hover:bg-[#16A34A]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/40"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      medicalAnswers: {
                        ...prev.medicalAnswers,
                        ...Object.fromEntries(MEDICAL_YES_NO_FIELDS.map(([key]) => [key, "N"])),
                        pregnant: "No",
                      },
                    }))
                  }
                >
                  Mark all No
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {MEDICAL_YES_NO_FIELDS.map(([key, label]) => (
                  <div key={key} className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <div className="mb-1 text-sm font-medium">{label}</div>
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-1">
                        <input
                          className="h-4 w-4 accent-[#FFC400]"
                          type="radio"
                          name={key}
                          checked={String((form.medicalAnswers as unknown as Record<string, unknown>)[key] || "") === "Y"}
                          onChange={() =>
                            setForm({
                              ...form,
                              medicalAnswers: { ...form.medicalAnswers, [key]: "Y" },
                            })
                          }
                        />
                        Yes
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          className="h-4 w-4 accent-[#FFC400]"
                          type="radio"
                          name={key}
                          checked={String((form.medicalAnswers as unknown as Record<string, unknown>)[key] || "") === "N"}
                          onChange={() =>
                            setForm({
                              ...form,
                              medicalAnswers: { ...form.medicalAnswers, [key]: "N" },
                            })
                          }
                        />
                        No
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="mb-2 text-sm font-medium">Injury areas</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {INJURY_KEYS.map((item) => (
                    <label key={item.key} className="flex items-center gap-1">
                      <input
                        className="h-4 w-4 accent-[#FFC400]"
                        type="checkbox"
                        checked={Boolean(form.medicalAnswers.injuries?.[item.key])}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            medicalAnswers: {
                              ...form.medicalAnswers,
                              injuries: { ...form.medicalAnswers.injuries, [item.key]: e.target.checked },
                            },
                          })
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <Input
                    className={fieldCls(false)}
                  placeholder="Other injury notes"
                  value={form.medicalAnswers.injuries?.other || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      medicalAnswers: {
                        ...form.medicalAnswers,
                        injuries: { ...form.medicalAnswers.injuries, other: e.target.value },
                      },
                    })
                  }
                />
                <div className="mt-3 flex gap-2">
                  <Input
                    className={fieldCls(false)}
                    placeholder="Add injury note"
                    value={injuryNote}
                    onChange={(e) => setInjuryNote(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const text = injuryNote.trim();
                      if (!text) return;
                      setForm((f) => ({
                        ...f,
                        medicalAnswers: {
                          ...f.medicalAnswers,
                          injuryNotesLog: [
                            {
                              id: crypto.randomUUID(),
                              text,
                              at: new Date().toISOString(),
                              by: staffName,
                            },
                            ...(f.medicalAnswers.injuryNotesLog || []),
                          ],
                        },
                      }));
                      setInjuryNote("");
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {(form.medicalAnswers.injuryNotesLog || []).slice(0, 4).map((n) => (
                    <div key={n.id}>
                      {String(n.at).slice(0, 16)}: {n.text}
                      {n.by ? ` (${n.by})` : ""}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Pregnant (Yes/No) and weeks</Label>
                <div className="mt-1 flex gap-2">
                  <Select
                    className={fieldCls(false)}
                    value={form.medicalAnswers.pregnant || "No"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        medicalAnswers: { ...form.medicalAnswers, pregnant: e.target.value },
                      })
                    }
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </Select>
                  <Input
                    className={fieldCls(false)}
                    placeholder="Weeks"
                    value={form.medicalAnswers.pregnantWeeks}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        medicalAnswers: { ...form.medicalAnswers, pregnantWeeks: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              {(
                [
                  ["physicalActivity", "Physical activity"],
                  ["surgeryHistory", "Surgery history"],
                  ["smoking", "Smoking details"],
                  ["medication", "Medication details"],
                  ["extraInfo", "Anything else we need to know"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    className={fieldCls(false)}
                    value={String(form.medicalAnswers[key] || "")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        medicalAnswers: { ...form.medicalAnswers, [key]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4 rounded-[20px] border border-white/80 bg-white/92 p-4 pb-6 shadow-[0_10px_30px_rgba(16,26,50,0.06)]">
              <div className="whitespace-pre-wrap rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs leading-relaxed text-[#172238]">
                {String(settings?.acknowledgementTemplate || ACK_DEFAULT)}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  id="add-member-ackAccepted"
                  className="h-4 w-4 accent-[#FFC400]"
                  type="checkbox"
                  checked={form.ackAccepted}
                  onChange={(e) => setForm({ ...form, ackAccepted: e.target.checked })}
                />
                I acknowledge and accept <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>
                    Signature (Type Full Name) <span className="text-rose-600">*</span>
                  </Label>
                  <Input className={fieldCls(req5.ackSignature, true)} readOnly value={form.name} />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    className={fieldCls(false)}
                    value={form.ackDate}
                    onChange={(e) => setForm({ ...form, ackDate: e.target.value })}
                  />
                </div>
              </div>
              {isMinor ? (
                <div className="space-y-3">
                  <div className="whitespace-pre-wrap rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-[#172238]">
                    {String(settings?.acknowledgementUnder18Template || ACK_U18_DEFAULT)}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label>
                        Parent/Guardian Full Name <span className="text-rose-600">*</span>
                      </Label>
                      <Input
                        id="add-member-parentGuardianName"
                        className={fieldCls(req5.parentGuardianName)}
                        value={form.parentGuardianName}
                        onChange={(e) => setForm({ ...form, parentGuardianName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Parent/Guardian DOB</Label>
                      <Input
                        type="date"
                        className={fieldCls(false)}
                        value={form.parentGuardianDob}
                        onChange={(e) => setForm({ ...form, parentGuardianDob: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>
                        Parent/Guardian Signature <span className="text-rose-600">*</span>
                      </Label>
                      <Input
                        id="add-member-parentGuardianSignature"
                        className={fieldCls(req5.parentGuardianSignature)}
                        value={form.parentGuardianSignature}
                        onChange={(e) => setForm({ ...form, parentGuardianSignature: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col-reverse justify-end gap-2 border-t border-white/60 bg-white/80 px-4 py-3 backdrop-blur-xl sm:flex-row sm:px-6">
          {step === 5 ? (
            <>
              <Button variant="outline" onClick={() => setStep(4)} disabled={saving}>
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadAdmission()}
                disabled={!form.name.trim()}
              >
                Download admission PDF
              </Button>
              <Button className={primaryBtn} onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save New Member"}
              </Button>
            </>
          ) : step === 4 ? (
            <>
              <Button variant="outline" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm({ ...form, medicalSkipped: true });
                  setStep(5);
                }}
              >
                Skip For Now
              </Button>
              <Button className={primaryBtn} onClick={next}>Next</Button>
            </>
          ) : step >= 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>
                Back
              </Button>
              <Button className={primaryBtn} onClick={next}>Next</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button className={primaryBtn} onClick={next}>Next</Button>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
