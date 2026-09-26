/** Fixed questions. 4 of 5 correct is 75% or more. */
export const STAFF_PIN_QUESTIONS = [
  { key: 'mother_name', label: "What is your mother's name?" },
  { key: 'date_of_birth', label: 'What is your date of birth?' },
  { key: 'brother_name', label: "What is your brother's name?" },
  { key: 'birth_place', label: 'What is your birth place?' },
  { key: 'father_name', label: "What is your father's name?" },
];

export const PIN_QUESTION_PASS_COUNT = 4;
export const PIN_PASSWORD_ATTEMPTS = 3;
export const PIN_HISTORY_KEEP = 2;
export const PIN_TEMP_HOURS = 6;

export function normalizePinAnswer(key, value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (key !== 'date_of_birth') return raw;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!dmy) return raw;
  return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

export function isStaffPin(value) {
  return /^\d{4,8}$/.test(String(value || '').trim());
}

export function answersPass(correctCount) {
  return Number(correctCount) >= PIN_QUESTION_PASS_COUNT;
}
