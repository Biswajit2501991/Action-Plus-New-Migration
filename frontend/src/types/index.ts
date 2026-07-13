export type MemberStatus = "Active" | "Hold" | "Deactivated" | "Cancelled" | string;

export type Payment = {
  id?: string;
  amount?: number;
  method?: string;
  paidAt?: string;
  paid_at?: string;
  paidMonth?: string;
  paid_month?: string;
  note?: string;
  [key: string]: unknown;
};

export type Member = {
  memberId: string;
  name?: string;
  mobile?: string;
  email?: string;
  gender?: string;
  dob?: string;
  plan?: string;
  status?: MemberStatus;
  holdDuration?: string;
  joiningDate?: string;
  billingDate?: string;
  paymentBy?: string;
  nextPaymentDate?: string;
  amount?: number;
  paymentMethod?: string;
  formNo?: string | number;
  staff?: string;
  renewalDate?: string;
  assignedGymCodeId?: string;
  assigned_gym_code_id?: string;
  trainerId?: string;
  photoUrl?: string;
  photo?: string;
  photoVersion?: number;
  paymentHistory?: Payment[];
  lastSmsSent?: Record<string, { sentAt?: string; sentBy?: string; ts?: string; by?: string }>;
  messageHistory?: Array<Record<string, unknown>>;
  smsHistory?: Array<Record<string, unknown>>;
  payMonth?: string;
  pay_month?: string;
  notes?: string;
  emergencyContact?: string;
  medicalConditions?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type Visitor = {
  id: string;
  name?: string;
  mobile?: string;
  email?: string;
  visitDate?: string;
  notes?: string;
  status?: string;
  assignedGymCodeId?: string;
  [key: string]: unknown;
};

export type StaffUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  sections?: string[];
  access?: AccessMap;
  blocked?: boolean;
  staffRole?: string;
  assignedBranchIds?: string[];
  homeBranchId?: string;
  photoUrl?: string;
  [key: string]: unknown;
};

export type AccessMap = {
  dashboard?: Record<string, boolean>;
  finance?: Record<string, boolean>;
  settings?: Record<string, boolean>;
  whatsapp?: Record<string, boolean>;
  leave?: Record<string, boolean>;
  members?: Record<string, boolean>;
  ptClients?: Record<string, boolean>;
  attendance?: Record<string, boolean>;
  logs?: Record<string, boolean>;
  support?: Record<string, boolean>;
  backend?: Record<string, boolean>;
  paymentQr?: Record<string, boolean>;
};

export type AuthUser = StaffUser & {
  gymId?: string;
  gymCodeId?: string;
  activeBranchId?: string;
  allowedBranchIds?: string[];
  staffRole?: string;
  roles?: string[];
};

export type GymCode = {
  id: string;
  code?: string;
  name?: string;
  label?: string;
  [key: string]: unknown;
};

export type FinanceTransaction = {
  id?: string;
  externalTxId?: string;
  type?: "income" | "expense" | string;
  amount?: number;
  category?: string;
  description?: string;
  paidAt?: string;
  date?: string;
  status?: string;
  memberId?: string;
  source?: string;
  [key: string]: unknown;
};

export type AuditLog = {
  id: string;
  action?: string;
  actorId?: string;
  actorName?: string;
  message?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AttendanceRecord = {
  id?: string;
  staffId?: string;
  date?: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  [key: string]: unknown;
};

export type LeaveRequest = {
  id: string;
  staffId?: string;
  fromDate?: string;
  toDate?: string;
  reason?: string;
  status?: "pending" | "approved" | "rejected" | string;
  [key: string]: unknown;
};

export type AppSettings = {
  plans?: string[];
  statuses?: string[];
  paymentMethods?: string[];
  expenseCategories?: string[];
  holdDurations?: string[];
  genders?: string[];
  roleTemplates?: unknown[];
  ptClientProfiles?: Record<string, unknown>;
  smsTemplates?: Record<string, unknown>;
  financeUseEstimatedExpense?: boolean;
  staffAttendance?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  [key: string]: unknown;
};

export type FinanceSummary = {
  collectedRevenue?: number;
  expense?: number;
  profit?: number;
  prevMonthCollected?: number;
  revenueGrowthPct?: number;
  ytdCollected?: number;
  [key: string]: unknown;
};
