import { describe, expect, it } from 'vitest';
import {
  admissionPdfBytes,
  admissionPdfFileName,
  buildAdmissionPdfSections,
} from '../frontend/src/features/members/add-member-admission-pdf.ts';

function medical(overrides = {}) {
  return {
    heartDisease: '',
    cardiovascularCondition: '',
    bloodPressure: '',
    arthritis: '',
    goutFamilyHistory: '',
    otherCondition: '',
    injuries: {
      knees: false,
      lowerBack: false,
      neckShoulders: false,
      hipsPelvis: false,
      flexibility: false,
      other: '',
    },
    pregnant: 'No',
    pregnantWeeks: '',
    physicalActivity: '',
    surgeryHistory: '',
    smoking: '',
    medication: '',
    extraInfo: '',
    injuryNotesLog: [],
    ...overrides,
  };
}

function sample(overrides = {}) {
  return {
    name: 'Bis',
    formNo: '12',
    email: 'bis@example.com',
    dob: '2000-01-02',
    gender: 'Male',
    mobile: '7718720770',
    address: 'Kolkata',
    branch: 'AP01 / Action Plus',
    staff: 'Desk',
    amount: '1500',
    plan: 'Monthly',
    joiningDate: '2026-11-14',
    billingDate: '2026-11-14',
    nextPaymentDate: '2026-12-14',
    paymentBy: '2026-11-21',
    status: 'Active',
    paymentMethod: 'Cash',
    remark: '',
    medicalSkipped: false,
    medical: medical(),
    acknowledgement: 'ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK',
    ackAccepted: true,
    ackDate: '2026-11-14',
    signature: 'Bis',
    isMinor: false,
    under18Acknowledgement: 'Parent acknowledgement',
    parentGuardianName: '',
    parentGuardianDob: '',
    parentGuardianSignature: '',
    ...overrides,
  };
}

describe('add member admission pdf', () => {
  it('names the file from the full name', () => {
    expect(admissionPdfFileName('Bis')).toBe('Bis-admission.pdf');
    expect(admissionPdfFileName('  Bis Kumar  ')).toBe('Bis Kumar-admission.pdf');
    expect(admissionPdfFileName('')).toBeNull();
    expect(admissionPdfFileName('   ')).toBeNull();
  });

  it('puts the printed acknowledgement and the full name signature on the sheet', () => {
    const sections = buildAdmissionPdfSections(sample());
    const text = sections.map((section) => `${section.title}\n${section.body}`).join('\n');
    expect(text).toContain('Membership Registration Form');
    expect(text).toContain('Name: Bis');
    expect(text).toContain('ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK');
    expect(text).toContain('Signature: Bis');
    expect(text).toContain('Which Membership are you signing up for: Monthly');
    expect(text).toContain('Form Number: 12');
    const parent = sections.find((section) => section.title.includes('UNDER 18'));
    expect(parent.body).toContain('Full Name of Parent / Guardian:');
    expect(parent.body).not.toContain('Ada Parent');
  });

  it('marks a skipped medical questionnaire and fills the parent lines for a minor', () => {
    const skipped = buildAdmissionPdfSections(sample({ medicalSkipped: true }))
      .find((section) => section.title === 'Medical questionnaire');
    expect(skipped.body).toContain('Medical questionnaire skipped.');

    const minor = buildAdmissionPdfSections(sample({
      isMinor: true,
      parentGuardianName: 'Ada Parent',
      parentGuardianSignature: 'Ada Parent',
    })).find((section) => section.title.includes('UNDER 18'));
    expect(minor.body).toContain('Full Name of Parent / Guardian: Ada Parent');
    expect(minor.body).toContain('Signature of Parent / Guardian: Ada Parent');
  });

  it('builds a pdf file', async () => {
    const bytes = new Uint8Array(await admissionPdfBytes(sample()));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });
});
