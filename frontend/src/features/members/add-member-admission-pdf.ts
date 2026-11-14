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

function shown(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function lines(pairs: [string, unknown][]) {
  return pairs.map(([label, value]) => `${label}: ${shown(value)}`).join("\n");
}

function medicalBody(medical: AdmissionMedicalAnswers, skipped: boolean) {
  const yesNo = YES_NO.map(([key, label]) => `${label}: ${shown(medical[key])}`);
  const injuries = INJURIES.filter(([key]) => Boolean(medical.injuries?.[key])).map(([, label]) => label);
  const notes = (medical.injuryNotesLog || []).map((note) => String(note.text || "").trim()).filter(Boolean);
  const parts = [
    skipped ? "Medical questionnaire skipped." : "",
    ...yesNo,
    `Injuries: ${injuries.length ? injuries.join(", ") : "—"}`,
    `Other injury: ${shown(medical.injuries?.other)}`,
    `Pregnant: ${shown(medical.pregnant)}`,
    `Pregnant weeks: ${shown(medical.pregnantWeeks)}`,
    `Physical activity: ${shown(medical.physicalActivity)}`,
    `Surgery history: ${shown(medical.surgeryHistory)}`,
    `Smoking details: ${shown(medical.smoking)}`,
    `Medication details: ${shown(medical.medication)}`,
    `Anything else: ${shown(medical.extraInfo)}`,
    `Injury notes: ${notes.length ? notes.join("; ") : "—"}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export function admissionPdfFileName(fullName: string) {
  const name = String(fullName || "").trim().replace(/\s+/g, " ");
  const safe = name.replace(/[\\/:*?"<>|]/g, "").trim();
  if (!safe) return null;
  return `${safe}-admission.pdf`;
}

export function buildAdmissionPdfSections(input: AdmissionPdfInput): AdmissionPdfSection[] {
  const signature = String(input.signature || input.name || "").trim();
  const sections: AdmissionPdfSection[] = [
    {
      title: "Member",
      body: lines([
        ["Full Name", input.name],
        ["Form Number", input.formNo],
        ["Email", input.email],
        ["Date of Birth", input.dob],
        ["Gender", input.gender],
        ["Mobile", input.mobile],
        ["Address", input.address],
        ["Branch", input.branch],
        ["Staff", input.staff],
      ]),
    },
    {
      title: "Membership",
      body: lines([
        ["Plan", input.plan],
        ["Amount (INR)", input.amount],
        ["Joining Date", input.joiningDate],
        ["Bill Date", input.billingDate],
        ["Next Payment Date", input.nextPaymentDate],
        ["Payment By", input.paymentBy],
        ["Status", input.status],
        ["Payment Method", input.paymentMethod],
        ["Remark", input.remark],
      ]),
    },
    {
      title: "Medical",
      body: medicalBody(input.medical, input.medicalSkipped),
    },
    {
      title: "Acknowledgement",
      body: [
        String(input.acknowledgement || "").trim() || "—",
        "",
        `Accepted: ${input.ackAccepted ? "Yes" : "No"}`,
        `Date: ${shown(input.ackDate)}`,
        `Signed: ${shown(signature)}`,
      ].join("\n"),
    },
  ];
  if (input.isMinor) {
    sections.push({
      title: "Parent or guardian",
      body: [
        String(input.under18Acknowledgement || "").trim() || "—",
        "",
        `Parent/Guardian Name: ${shown(input.parentGuardianName)}`,
        `Parent/Guardian Date of Birth: ${shown(input.parentGuardianDob)}`,
        `Parent/Guardian Signed: ${shown(input.parentGuardianSignature)}`,
      ].join("\n"),
    });
  }
  return sections;
}

function imageFormat(dataUrl: string) {
  const mime = String(dataUrl || "").slice(0, 40).toLowerCase();
  if (mime.startsWith("data:image/png")) return "PNG";
  if (mime.startsWith("data:image/jpeg") || mime.startsWith("data:image/jpg")) return "JPEG";
  if (mime.startsWith("data:image/webp")) return "WEBP";
  return null;
}

export async function admissionPdfBytes(input: AdmissionPdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;
  const photoFormat = imageFormat(String(input.photoDataUrl || ""));
  let photoWidth = 0;
  if (photoFormat && input.photoDataUrl) {
    try {
      photoWidth = 72;
      doc.addImage(input.photoDataUrl, photoFormat, pageWidth - margin - photoWidth, margin, photoWidth, photoWidth);
    } catch {
      photoWidth = 0;
    }
  }

  const write = (text: string, size: number, style: "normal" | "bold", gapAfter: number, width = pageWidth - margin * 2 - (y < margin + 80 ? photoWidth + 12 : 0)) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text || " ", Math.max(180, width));
    const lineHeight = size + 4;
    for (const line of wrapped) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(String(line), margin, y);
      y += lineHeight;
    }
    y += gapAfter;
  };

  write("Action Plus Gym", 16, "bold", 2, pageWidth - margin * 2 - photoWidth - 12);
  write("New Member Admission", 12, "bold", 14, pageWidth - margin * 2 - photoWidth - 12);
  if (photoWidth) y = Math.max(y, margin + photoWidth + 16);

  for (const section of buildAdmissionPdfSections(input)) {
    write(section.title, 12, "bold", 4);
    write(section.body, 10, "normal", 12);
  }

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
