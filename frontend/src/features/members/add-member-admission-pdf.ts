import type { jsPDF } from "jspdf";

export type AdmissionMedicalAnswers = {
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
  injuryNotesLog: { text: string }[];
};

export type AdmissionPdfInput = {
  name: string;
  formNo: string;
  email: string;
  dob: string;
  gender: string;
  mobile: string;
  address: string;
  branch: string;
  staff: string;
  amount: string;
  plan: string;
  joiningDate: string;
  billingDate: string;
  nextPaymentDate: string;
  paymentBy: string;
  status: string;
  paymentMethod: string;
  remark: string;
  photoDataUrl?: string;
  medicalSkipped: boolean;
  medical: AdmissionMedicalAnswers;
  acknowledgement: string;
  ackAccepted: boolean;
  ackDate: string;
  signature: string;
  isMinor: boolean;
  under18Acknowledgement: string;
  parentGuardianName: string;
  parentGuardianDob: string;
  parentGuardianSignature: string;
};

export type AdmissionPdfSection = {
  title: string;
  body: string;
};

const YES_NO: [keyof AdmissionMedicalAnswers, string][] = [
  ["heartDisease", "Heart Disease"],
  ["cardiovascularCondition", "Cardiovascular Condition"],
  ["bloodPressure", "High/Low Blood Pressure"],
  ["arthritis", "Arthritis"],
  ["goutFamilyHistory", "Gout Family Hx of Heart Disease"],
  ["otherCondition", "Other Condition"],
];

const INJURIES: [keyof AdmissionMedicalAnswers["injuries"], string][] = [
  ["knees", "Knees"],
  ["lowerBack", "Lower Back"],
  ["neckShoulders", "Neck/Shoulders"],
  ["hipsPelvis", "Hips/Pelvis"],
  ["flexibility", "Flexibility"],
];

const LETTERHEAD = [
  "Email- gymactionplus@gmail.com / Ph- +91- 9091872510",
  "Opening Hours - 6:00* AM to 10:00* PM (Monday to Saturday) Sunday*",
  "Address - Subhas Nagar, P.O ADRA, Dist- Purulia(W.B), PIN- 723121",
];

const ACK_BODY = [
  "Warning: This is an important document, which affects your legal rights and obligations. Please read it carefully and do not sign it unless you understand it. If you have any questions, please ask.",
  "Acknowledgment of Risks, Injury and Obligations",
  "I acknowledge that the activities I am to undertake have potential dangers and by participating in them I am exposed to certain risks. I acknowledge and understand that whilst participating in any such activities:",
  "- I may be injured physically, mentally or may die;",
  "- Any physical conditions I may have, of which I may or may not be aware of, which I may or may not have disclosed to the centre or its staff, may be aggravated or worsened by my participation;",
  "- My personal property may be lost or damaged;",
  "- Other persons participating in such activities may cause me injury or may damage my property;",
  "- I may cause injury to other persons or damage their property;",
  "- The conditions in which the activities are conducted may vary without warning;",
  "- I may be injured or die or suffer damage to my property as a result of negligence or breach of contract of the Fitness Centre operator, or its servants or agents; and",
  "- There may be no or inadequate facilities for treatment or transport of me if I am injured.",
  "- I assume the risk of, and the responsibility for any injury, illness, death or property resulting from my participation in any activity.",
  "Release and Indemnity to Fitness Centre Operator",
  "In the consideration of the acceptance of my payment (or guest status) for participating in any activity (except to the extent that the centre may be precluded by statute) I agree to release and indemnify the Fitness Centre Operator and staff as follows:",
  "- I participate in the activities at my sole risk and responsibility; and",
  "- I release, indemnify and hold harmless the Fitness Centre Operator, its servants and agents, from and against all and any actions or claims which may be made by me or on my behalf or by other parties for or in respect of arising out of any injury, loss, damage or death caused to me or my property whether by negligence, breach of contract or in any way whatsoever.",
  "I also agree that in the event that I am injured or my property is lost or damaged, I will bring no claim, legal or otherwise, against the Fitness Centre operator or its servants and agents, in respect of that injury, loss or damage.",
  "Before signing this document, I have read and acknowledged and know how it affects my legal rights.",
];

const UNDER_18_BODY = [
  "(Parent / Guardian to read and sign). I, being a parent or legal guardian of the person named in this Acknowledgement and Release hereby acknowledge and agree:",
  "- I have read the whole document and understand it;",
  "- I consent to the person, named in this Acknowledgement and Release, participating in the activity; and",
  "- I am aware of the risks, dangers and obligations set out above in this Acknowledgement and Release.",
  "In consideration of the person named in the Acknowledgement and Release being accepted to participate in any activity, I agree to release and indemnify the Fitness Centre operator, its servants and agents, in the same manner and to the same effect and extent as if I were the person first named in this Acknowledgement and Release and the person participating in any of these activities.",
];

const BLUE: [number, number, number] = [31, 78, 160];
const ORANGE: [number, number, number] = [214, 108, 20];
const INK: [number, number, number] = [25, 25, 25];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function displayDate(value: unknown) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function yn(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  if (/^y/i.test(text)) return "Y";
  if (/^n/i.test(text)) return "N";
  return text;
}

function clubTitle(branch: string) {
  const raw = clean(branch);
  const place = raw.includes("/") ? clean(raw.split("/").pop()) : raw;
  return `Action Plus Gym and Fitness Club – ${(place || "Adra").toUpperCase()}`;
}

export function admissionPdfFileName(fullName: string) {
  const name = clean(fullName);
  const safe = name.replace(/[\\/:*?"<>|]/g, "").trim();
  if (!safe) return null;
  return `${safe}-admission.pdf`;
}

export function buildAdmissionPdfSections(input: AdmissionPdfInput): AdmissionPdfSection[] {
  const signature = clean(input.signature || input.name);
  const injuries = INJURIES.map(([key, label]) => `${input.medical.injuries?.[key] ? "[x]" : "[ ]"} ${label}`).join("  ");
  const notes = (input.medical.injuryNotesLog || []).map((note) => clean(note.text)).filter(Boolean).join("; ");
  const details = [
    ["Form Number", input.formNo],
    ["Email", input.email],
    ["Address", input.address],
    ["Branch", input.branch],
    ["Staff", input.staff],
    ["Joining Date", displayDate(input.joiningDate)],
    ["Bill Date", displayDate(input.billingDate)],
    ["Next Payment Date", displayDate(input.nextPaymentDate)],
    ["Payment By", displayDate(input.paymentBy)],
    ["Status", input.status],
    ["Remark", input.remark],
  ]
    .map(([label, value]) => `${label}: ${clean(value) || "—"}`)
    .join("\n");
  const medical = [
    input.medicalSkipped ? "Medical questionnaire skipped." : "",
    ...YES_NO.map(([key, label]) => `${label} (Y/N): ${yn(input.medical[key]) || "—"}`),
    `Injuries: ${injuries}`,
    `Other injury: ${clean(input.medical.injuries?.other) || "—"}`,
    `Pregnant: ${clean(input.medical.pregnant) || "—"}`,
    `Weeks: ${clean(input.medical.pregnantWeeks) || "—"}`,
    `Physical activity: ${clean(input.medical.physicalActivity) || "—"}`,
    `Surgery history: ${clean(input.medical.surgeryHistory) || "—"}`,
    `Smoking details: ${clean(input.medical.smoking) || "—"}`,
    `Medication details: ${clean(input.medical.medication) || "—"}`,
    `Anything else: ${clean(input.medical.extraInfo) || "—"}`,
    `Injury notes: ${notes || "—"}`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    {
      title: "Membership Registration Form",
      body: [
        `Name: ${clean(input.name) || "—"}`,
        `Male / Female: ${clean(input.gender) || "—"}`,
        `Date of birth: ${displayDate(input.dob) || "—"}`,
        `Mobile: ${clean(input.mobile) || "—"}`,
        `Which Membership are you signing up for: ${clean(input.plan) || "—"}`,
        `Amount (INR): ${clean(input.amount) || "—"}`,
        `Method of Payment: Upfront Payment and Monthly Advance${clean(input.paymentMethod) ? ` · ${clean(input.paymentMethod)}` : ""}`,
        details,
      ].join("\n"),
    },
    { title: "Medical questionnaire", body: medical },
    {
      title: "ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK",
      body: [
        ...ACK_BODY,
        `Full Name: ${clean(input.name) || "—"}`,
        `DOB: ${displayDate(input.dob) || "—"}`,
        `Signature: ${signature || "—"}`,
        `Date: ${displayDate(input.ackDate) || "—"}`,
      ].join("\n"),
    },
    {
      title: "WHERE PARTICIPANT IS UNDER 18 YEARS OF AGE",
      body: [
        ...UNDER_18_BODY,
        `Full Name of Parent / Guardian: ${input.isMinor ? clean(input.parentGuardianName) : ""}`,
        `DOB: ${input.isMinor ? displayDate(input.parentGuardianDob) : ""}`,
        `Signature of Parent / Guardian: ${input.isMinor ? clean(input.parentGuardianSignature) : ""}`,
        `DATE: ${input.isMinor ? displayDate(input.ackDate) : ""}`,
      ].join("\n"),
    },
  ];
}

type Rgb = [number, number, number];

function drawForm(doc: jsPDF, input: AdmissionPdfInput, logo: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const width = pageWidth - margin * 2;
  let y = 34;

  const ensure = (height: number) => {
    if (y + height <= pageHeight - 28) return;
    doc.addPage();
    y = 36;
  };
  const ink = (color: Rgb) => doc.setTextColor(color[0], color[1], color[2]);
  const write = (text: string, size: number, style: "normal" | "bold", color: Rgb, gap: number, maxWidth = width) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    ink(color);
    const lines = doc.splitTextToSize(text || " ", maxWidth) as string[];
    const lineHeight = size + 2.4;
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };
  const rule = (weight = 1) => {
    ensure(8);
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(weight);
    doc.line(margin, y, margin + width, y);
    y += 10;
  };
  const field = (x: number, label: string, value: string, fieldWidth: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    ink(INK);
    doc.text(label, x, y);
    const start = x + doc.getTextWidth(label) + 3;
    const end = x + fieldWidth;
    doc.setFont("helvetica", "bold");
    const room = Math.max(16, end - start - 2);
    const shown = ((doc.splitTextToSize(value || " ", room) as string[])[0] || "").trim();
    if (value && shown) doc.text(shown, start, y);
    doc.setDrawColor(70, 70, 70);
    doc.setLineWidth(0.4);
    doc.line(start, y + 2, end, y + 2);
  };

  const signature = clean(input.signature || input.name);
  write(clubTitle(input.branch), 13, "bold", BLUE, 2, width - (logo ? 78 : 0));
  if (logo) {
    try {
      doc.addImage(logo, "PNG", pageWidth - margin - 64, 28, 64, 64);
    } catch {
      /* The form still prints when the logo cannot be drawn. */
    }
  }
  for (const line of LETTERHEAD) write(line, 8, "normal", INK, 0, width - (logo ? 78 : 0));
  y = Math.max(y + 6, logo ? 100 : y + 4);
  rule(1.4);
  write("Membership Registration Form", 13, "bold", ORANGE, 2);
  rule(0.6);

  field(margin, "Title (Mr./Mrs./Miss/Ms.)", "", 190);
  field(margin + 198, "Name:", clean(input.name), width - 198);
  y += 16;
  field(margin, "Male / Female", clean(input.gender), 230);
  field(margin + 246, "Date of birth", displayDate(input.dob), width - 246);
  y += 16;
  field(margin, "Telephone (Home)", "", 150);
  field(margin + 158, "(Work)", "", 130);
  field(margin + 296, "Mobile", clean(input.mobile), width - 296);
  y += 16;
  field(margin, "Occupation", "", 220);
  field(margin + 236, "Company", "", width - 236);
  y += 16;
  field(margin, "Doctor's Name", "", 240);
  field(margin + 256, "Phone", "", width - 256);
  y += 16;
  field(margin, "Emergency Contact:", "", 250);
  field(margin + 266, "Phone", "", width - 266);
  y += 16;
  field(margin, "Do you have private health insurance? (Y / N) If yes which fund?", "", width);
  y += 16;
  field(margin, "How did you find out about our gym?", "", width);
  y += 16;
  field(margin, "Which Membership are you signing up for:", clean(input.plan), width);
  y += 14;
  write(
    [
      `Amount (INR): ${clean(input.amount) || "—"}`,
      `Form Number: ${clean(input.formNo) || "—"}`,
      `Email: ${clean(input.email) || "—"}`,
      `Address: ${clean(input.address) || "—"}`,
      `Branch: ${clean(input.branch) || "—"}`,
      `Staff: ${clean(input.staff) || "—"}`,
      `Joining Date: ${displayDate(input.joiningDate) || "—"}`,
      `Bill Date: ${displayDate(input.billingDate) || "—"}`,
      `Next Payment Date: ${displayDate(input.nextPaymentDate) || "—"}`,
      `Payment By: ${displayDate(input.paymentBy) || "—"}`,
      `Status: ${clean(input.status) || "—"}`,
      clean(input.remark) ? `Remark: ${clean(input.remark)}` : "",
    ]
      .filter(Boolean)
      .join("   "),
    8,
    "normal",
    INK,
    4,
  );
  field(
    margin,
    "Method of Payment:",
    `Upfront Payment and Monthly Advance${clean(input.paymentMethod) ? ` · ${clean(input.paymentMethod)}` : ""}`,
    width,
  );
  y += 12;
  rule(1.2);
  write("Medical questionnaire", 13, "bold", ORANGE, 2);
  if (input.medicalSkipped) write("Medical questionnaire skipped.", 9, "bold", INK, 2);
  const yesNoLine = (rows: typeof YES_NO) =>
    rows.map(([key, label]) => `${label} (Y/N) ${yn(input.medical[key]) || "____"}`).join("    ");
  write(`1. Have you ever or do you have any of the following?`, 9, "normal", INK, 1);
  write(yesNoLine(YES_NO.slice(0, 3)), 8, "bold", INK, 1);
  write(yesNoLine(YES_NO.slice(3)), 8, "bold", INK, 2);
  const injuryLine = INJURIES.map(([key, label]) => `${input.medical.injuries?.[key] ? "[x]" : "[ ]"} ${label}`).join("   ");
  write("2. Do you have any problems/injuries in the follow areas? (Please tick and explain to the best of your ability):", 9, "normal", INK, 1);
  write(`${injuryLine}   Other: ${clean(input.medical.injuries?.other)}`, 8, "bold", INK, 1);
  const notes = (input.medical.injuryNotesLog || []).map((note) => clean(note.text)).filter(Boolean).join("; ");
  if (notes) write(`Injury notes: ${notes}`, 8, "normal", INK, 1);
  write(`3. Are you pregnant? ${clean(input.medical.pregnant) || "Yes/No"}    If so, how many week ${clean(input.medical.pregnantWeeks)}`, 9, "normal", INK, 1);
  write(`4. Are you currently doing any regular physical activity, what and how many times per week ${clean(input.medical.physicalActivity)}`, 9, "normal", INK, 1);
  write(`5. Have you had surgery in the last 5 years, if yes, when & what? ${clean(input.medical.surgeryHistory)}`, 9, "normal", INK, 1);
  write(`6. Do you smoke, if yes how many per day, and for how long have you smoked? ${clean(input.medical.smoking)}`, 9, "normal", INK, 1);
  write(`7. Are you on any medication, if yes what and when do you take? ${clean(input.medical.medication)}`, 9, "normal", INK, 1);
  write(`8. Anything else we need to know? (If unsure write it down) ${clean(input.medical.extraInfo)}`, 9, "normal", INK, 6);
  write("NOTE*: No members are allowed inside the Action Plus Gym and Fitness club without a Valid ID card.", 8, "bold", INK, 0);

  doc.addPage();
  y = 36;
  write("ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK", 12, "bold", ORANGE, 2);
  rule(0.8);
  for (const paragraph of ACK_BODY) {
    const heading = !paragraph.startsWith("-") && !paragraph.startsWith("I ") && !paragraph.startsWith("Warning") && !paragraph.startsWith("Before") && !paragraph.startsWith("In the");
    write(paragraph, heading ? 9 : 8, heading ? "bold" : "normal", heading ? ORANGE : INK, 2);
  }
  y += 4;
  field(margin, "Full Name:", clean(input.name), 180);
  field(margin + 186, "DOB:", displayDate(input.dob), 110);
  field(margin + 302, "Signature:", signature, 130);
  field(margin + 438, "Date:", displayDate(input.ackDate), width - 438);
  y += 16;
  write("WHERE PARTICIPANT IS UNDER 18 YEARS OF AGE", 11, "bold", ORANGE, 2);
  for (const paragraph of UNDER_18_BODY) {
    write(paragraph, 8, paragraph.startsWith("-") || paragraph.startsWith("(") || paragraph.startsWith("In ") ? "normal" : "bold", INK, 2);
  }
  y += 2;
  field(margin, "Full Name of Parent / Guardian:", input.isMinor ? clean(input.parentGuardianName) : "", 320);
  field(margin + 328, "DOB:", input.isMinor ? displayDate(input.parentGuardianDob) : "", width - 328);
  y += 16;
  field(margin, "Signature of Parent / Guardian:", input.isMinor ? clean(input.parentGuardianSignature) : "", 330);
  field(margin + 338, "DATE:", input.isMinor ? displayDate(input.ackDate) : "", width - 338);
}

async function gymLogoDataUrl() {
  if (typeof window === "undefined" || typeof fetch !== "function" || typeof FileReader === "undefined") return null;
  try {
    const response = await fetch("/assets/action-plus-logo.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function admissionPdfBytes(input: AdmissionPdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await gymLogoDataUrl();
  drawForm(doc, input, logo);
  return doc.output("arraybuffer");
}

export async function downloadAdmissionPdf(input: AdmissionPdfInput) {
  const fileName = admissionPdfFileName(input.name);
  if (!fileName) return;
  const bytes = await admissionPdfBytes(input);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
