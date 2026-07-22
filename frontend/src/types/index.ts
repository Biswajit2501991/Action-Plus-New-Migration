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
  hasPhoto?: boolean;
  memberUuid?: string | null;
  portalEnabled?: boolean;
  portalStatus?: string;
  portalActivatedAt?: string | null;
  lastPortalLoginAt?: string | null;
  hasPortalPin?: boolean;
  paymentHistory?: Payment[];
  lastSmsSent?: Record<string, { sentAt?: string; sentBy?: string; ts?: string; by?: string }>;
  messageHistory?: Array<Record<string, unknown>>;
  smsHistory?: Array<Record<string, unknown>>;
  payMonth?: string;
  pay_month?: string;
  notes?: string;
  emergencyContact?: string;
  medicalConditions?: string;
  medicalAnswers?: Record<string, unknown>;
  /** Slim-list summary of newest injury note (for Status/Messages chip). */
  latestInjuryNote?: {
    id?: string;
    text?: string;
    by?: string;
    at?: string;
  } | null;
  familyGroupId?: string;
  family_group_id?: string;
  familyPrimaryMemberId?: string;
  family_primary_member_id?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type Visitor = {
  id: string;
  name?: string;
  fullName?: string;
  mobile?: string;
  email?: string;
  dob?: string;
  gender?: string;
  visitDate?: string;
  addedAt?: string;
  notes?: string;
  interestPlan?: string;
  goal?: string;
  status?: string;
  callBackRequired?: boolean;
  tentativeJoiningDate?: string;
  lastCalledAt?: string;
  lastCalledBy?: string;
  /** Shared ack: any staff/owner who opens the new-visitor alert clears it for everyone. */
  staffSeenAt?: string | null;
  staffSeenBy?: string | null;
  assignedGymCodeId?: string;
  updatedAt?: string;
  convertedAt?: string;
  convertedMemberId?: string;
  /** Set when created via public Visitor QR intake. */
  intakeSource?: string;
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
  blockedReason?: string;
  staffRole?: string;
  gymCodeId?: string;
  assignedBranchIds?: string[];
  homeBranchId?: string;
  photoUrl?: string;
  photo?: string;
  photoVersion?: number;
  hasPhoto?: boolean;
  /** Present only for master owner responses from GET /api/users. */
  password?: string;
  hasPassword?: boolean;
  passwordResetStatus?: string;
  passwordResetRequestedAt?: string;
  passwordResetApprovedAt?: string;
  passwordResetRejectedAt?: string;
  passwordResetRejectedBy?: string;
  password_reset_requested_at?: string;
  password_reset_approved_at?: string;
  password_reset_rejected_at?: string;
  testProfile?: boolean;
  sandboxId?: string;
  syncBranchAssignments?: boolean;
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
  website?: Record<string, boolean>;
  paymentQr?: Record<string, boolean>;
  /** Phone app tabs + subsections — independent of web `sections`. */
  mobile?: Record<string, boolean>;
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
  branchName?: string;
  displayName?: string | null;
  logoUrl?: string | null;
  shiftStartTime?: string | null;
  shift_start_time?: string | null;
  shiftTimezone?: string | null;
  [key: string]: unknown;
};

export type BranchBrandingDto = {
  gymCodeId?: string;
  code?: string;
  branchName?: string;
  displayName?: string;
  logoUrl?: string | null;
  usesDefaultLogo?: boolean;
  updatedAt?: string | null;
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
  actor?: string;
  actorId?: string;
  actorName?: string;
  entityType?: string;
  entityId?: string;
  ts?: string;
  createdAt?: string;
  message?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  branchId?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AttendanceRecord = {
  id?: string;
  userId?: string;
  staffId?: string;
  date?: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  note?: string;
  notes?: string;
  firstLoginAt?: string;
  lastLogoutAt?: string;
  autoPresentWindowUntil?: string;
  timeZoneAtMark?: string;
  autoMarked?: boolean;
  markedBy?: string;
  leaveRequestId?: string;
  leaveAutoSynced?: boolean;
  updatedBy?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type AttendanceNote = {
  id?: string;
  staffLoginId?: string;
  attendanceDate?: string;
  attendanceRecordId?: string;
  noteCategory?: string;
  note?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type LeaveRequest = {
  id: string;
  staffId?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  status?: "pending" | "approved" | "rejected" | string;
  days?: number;
  reason?: string;
  approvedBy?: string;
  actionAt?: string;
  actionBy?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type AppSettings = {
  plans?: string[];
  statuses?: string[];
  paymentMethods?: string[];
  expenseCategories?: string[];
  holdDurations?: string[];
  genders?: string[];
  exerciseTypes?: string[];
  roleTemplates?: unknown[];
  ptClientProfiles?: Record<string, unknown>;
  smsTemplates?: Record<string, unknown>;
  medicalQuestionnaireTemplate?: string;
  acknowledgementTemplate?: string;
  acknowledgementUnder18Template?: string;
  gmailWelcomeTemplate?: string;
  financeUseEstimatedExpense?: boolean;
  attendanceNotesEnabled?: boolean;
  /** Visitor intake QR (public form + staff Visitor QR card). Default off. */
  qrVisitorIntakeEnabled?: boolean;
  /** @deprecated Combined master; prefer qrVisitorIntakeEnabled. */
  qrVisitorAttendanceEnabled?: boolean;
  /** Staff attendance QR: show kiosk and require scan before Time In. Default off. */
  attendanceRequirePresenceQr?: boolean;
  customTemplatesEnabled?: boolean;
  fineSmsEnabled?: boolean;
  fineSmsGraceDays?: number;
  fineSmsImmediateRoles?: string[];
  paymentQrInReminderEnabled?: boolean;
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
