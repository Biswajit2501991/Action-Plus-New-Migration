/**
 * Display-only progress for Add New Member.
 * Uses the same required-field flags the wizard already uses to allow Next and Save.
 * Does not decide whether a member can be saved.
 */

export type InvalidMap = Record<string, boolean>;

export const ADD_MEMBER_SECTION_LABELS = [
  "Member Details",
  "Membership Details",
  "Payment Details",
  "Medical Details",
  "Acknowledgement",
] as const;

/** Yes/no, injury areas, other injury text, injury note, weeks, and the five free-text answers. */
export const MEDICAL_PROGRESS_SLOTS = 6 + 5 + 1 + 1 + 1 + 5;

export type MedicalProgressAnswers = {
  heartDisease?: string;
  cardiovascularCondition?: string;
  bloodPressure?: string;
  arthritis?: string;
  goutFamilyHistory?: string;
  otherCondition?: string;
  injuries?: {
    knees?: boolean;
    lowerBack?: boolean;
    neckShoulders?: boolean;
    hipsPelvis?: boolean;
    flexibility?: boolean;
    other?: string;
  };
  pregnantWeeks?: string;
  physicalActivity?: string;
  surgeryHistory?: string;
  smoking?: string;
  medication?: string;
  extraInfo?: string;
  injuryNotesLog?: unknown[];
};

export type AddMemberSectionProgress = {
  label: (typeof ADD_MEMBER_SECTION_LABELS)[number];
  done: boolean;
  fraction: number;
};

export type AddMemberProgress = {
  percent: number;
  complete: boolean;
  sections: AddMemberSectionProgress[];
};

function validCount(invalid: InvalidMap) {
  const keys = Object.keys(invalid);
  const valid = keys.filter((key) => !invalid[key]).length;
  return { valid, total: keys.length };
}

function fraction(valid: number, total: number) {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, valid / total));
}

export function countMedicalProgressAnswers(answers: MedicalProgressAnswers | null | undefined) {
  const row = answers || {};
  let count = 0;
  for (const key of [
    "heartDisease",
    "cardiovascularCondition",
    "bloodPressure",
    "arthritis",
    "goutFamilyHistory",
    "otherCondition",
  ] as const) {
    if (String(row[key] || "").trim()) count += 1;
  }
  const injuries = row.injuries || {};
  for (const key of ["knees", "lowerBack", "neckShoulders", "hipsPelvis", "flexibility"] as const) {
    if (injuries[key]) count += 1;
  }
  if (String(injuries.other || "").trim()) count += 1;
  if (Array.isArray(row.injuryNotesLog) && row.injuryNotesLog.length > 0) count += 1;
  if (String(row.pregnantWeeks || "").trim()) count += 1;
  for (const key of ["physicalActivity", "surgeryHistory", "smoking", "medication", "extraInfo"] as const) {
    if (String(row[key] || "").trim()) count += 1;
  }
  return count;
}

export function computeAddMemberProgress(input: {
  req1: InvalidMap;
  req2: InvalidMap;
  req3: InvalidMap;
  req5: InvalidMap;
  medicalDone: boolean;
  medicalAnswered?: number;
  medicalSlots?: number;
}): AddMemberProgress {
  const step1 = validCount(input.req1);
  const step2 = validCount(input.req2);
  const step3 = validCount(input.req3);
  const step5 = validCount(input.req5);
  const f1 = fraction(step1.valid, step1.total);
  const f2 = fraction(step2.valid, step2.total);
  const f3 = fraction(step3.valid, step3.total);
  const slots = Math.max(1, Number(input.medicalSlots) || MEDICAL_PROGRESS_SLOTS);
  const answered = Math.max(0, Number(input.medicalAnswered) || 0);
  const f4 = input.medicalDone ? 1 : Math.min(0.92, answered / slots);
  const f5 = fraction(step5.valid, step5.total);
  const done = [f1 === 1, f2 === 1, f3 === 1, Boolean(input.medicalDone), f5 === 1];
  const complete = done.every(Boolean);
  const raw = Math.round(((f1 + f2 + f3 + f4 + f5) / 5) * 100);
  const percent = complete ? 100 : Math.max(0, Math.min(99, raw));
  const fractions = [f1, f2, f3, f4, f5];
  return {
    percent,
    complete,
    sections: ADD_MEMBER_SECTION_LABELS.map((label, index) => ({
      label,
      done: done[index],
      fraction: fractions[index],
    })),
  };
}
