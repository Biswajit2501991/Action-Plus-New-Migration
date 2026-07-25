export type PtChatMessage = {
  id: string;
  by?: string;
  text?: string;
  ts?: string;
};

export type PtSession = {
  id: string;
  date?: string;
  time?: string;
  status?: string;
  note?: string;
  createdAt?: string;
};

export type PtWeightLog = {
  id: string;
  date?: string;
  weight?: number;
  createdAt?: string;
};

export type PtDietAttachment = {
  id: string;
  name?: string;
  mime?: string;
  size?: number;
  dataUrl?: string;
  uploadedAt?: string;
};

export type PtClientProfile = {
  trainerId?: string;
  ptWorkoutNotes?: string;
  workoutPlan?: string;
  calories?: string;
  protein?: string;
  water?: string;
  dietPlan?: string;
  focusByDate?: Record<string, string>;
  focusArea?: string;
  chat?: PtChatMessage[];
  lastChatAt?: string;
  sessions?: PtSession[];
  weightLogs?: PtWeightLog[];
  dietAttachments?: PtDietAttachment[];
  updatedAt?: string;
  updatedBy?: string;
  [key: string]: unknown;
};

export type PtDietDraft = {
  calories: string;
  protein: string;
  water: string;
  dietPlan: string;
};

export type PtSaveMode = "workout" | "plan";
