export const STAFF_PIN_QUESTIONS = [
  { key: "mother_name", label: "What is your mother's name?", placeholder: "Mother's name" },
  { key: "date_of_birth", label: "What is your date of birth?", placeholder: "DD/MM/YYYY" },
  { key: "brother_name", label: "What is your brother's name?", placeholder: "Brother's name, or none" },
  { key: "birth_place", label: "What is your birth place?", placeholder: "City or village" },
  { key: "father_name", label: "What is your father's name?", placeholder: "Father's name" },
] as const;

export type PinQuestionKey = (typeof STAFF_PIN_QUESTIONS)[number]["key"];
