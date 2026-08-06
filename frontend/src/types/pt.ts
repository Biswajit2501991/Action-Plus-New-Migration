export type PtChatMessage = {
  id: string;
  by?: string;
  text?: string;
  ts?: string;
  /** Who sent it. Legacy notes without this field are treated as trainer. */
  from?: "trainer" | "member";
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
  /** Set when diet text or diet documents change (portal New badge). */
  lastDietAt?: string;
  focusByDate?: Record<string, string>;
  focusArea?: string;
  chat?: PtChatMessage[];
  lastChatAt?: string;
  lastMemberChatAt?: string;
  lastTrainerChatAt?: string;
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
