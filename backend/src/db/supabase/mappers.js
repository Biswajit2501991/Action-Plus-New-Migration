import crypto from 'node:crypto';
import { passwordResetStatusFromRecord } from '../../../../src/features/passwordReset/passwordResetStatus.js';
import { emptyText, financeStatusFromNumeric, financeStatusToNumeric, toDate, toTs } from './utils.js';

/** Columns fetched for list pulls — excludes photo blob; includes storage metadata. */
export const MEMBER_LIST_COLUMNS = [
  'id', 'member_code', 'form_no', 'full_name', 'email', 'mobile', 'dob', 'gender', 'address',
  'assigned_staff', 'plan_name', 'status', 'hold_duration', 'amount', 'payment_method',
  'joining_date', 'billing_date', 'billing_date_updated_at', 'next_payment_date', 'payment_by',
  'pay_month', 'remark', 'medical_skipped', 'ack_accepted', 'ack_date', 'parent_guardian_name',
  'parent_guardian_dob', 'family_group_id', 'family_primary_member_id', 'last_sms_sent_json',
  'updated_by', 'assigned_gym_code_id', 'created_at', 'updated_at',
  'photo_version', 'photo_path', 'photo_url',
].join(',');

/** Audit log columns for list pulls — excludes before/after JSON blobs. */
export const LOG_LIST_COLUMNS = [
  'id', 'external_log_id', 'actor_name', 'action', 'entity_type', 'entity_id', 'logged_at', 'gym_id',
].join(',');

export function memberRowToApp(row, children = {}, options = {}) {
  const slim = Boolean(options.slim);
  const medical = !slim && row.medical_answers_json && typeof row.medical_answers_json === 'object'
    ? { ...row.medical_answers_json }
    : {};
  if (!slim && children.injuryNotes?.length) {
    medical.injuryNotesLog = children.injuryNotes;
  }
  const base = {
    memberId: row.member_code,
    formNo: row.form_no,
    name: row.full_name,
    email: row.email,
    mobile: row.mobile,
    dob: row.dob,
    gender: row.gender,
    address: row.address,
    staff: row.assigned_staff,
    plan: row.plan_name,
    status: row.status,
    holdDuration: row.hold_duration,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    joiningDate: row.joining_date,
    billingDate: row.billing_date,
    billingDateUpdatedAt: row.billing_date_updated_at,
    nextPaymentDate: row.next_payment_date,
    paymentBy: row.payment_by,
    payMonth: row.pay_month,
    remark: row.remark,
    medicalSkipped: Boolean(row.medical_skipped),
    ackAccepted: Boolean(row.ack_accepted),
    ackDate: row.ack_date,
    parentGuardianName: row.parent_guardian_name,
    parentGuardianDob: row.parent_guardian_dob,
    familyGroupId: row.family_group_id,
    familyPrimaryMemberId: row.family_primary_member_id,
    lastSmsSent: row.last_sms_sent_json || undefined,
    updatedBy: row.updated_by,
    assignedGymCodeId: row.assigned_gym_code_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoVersion: Number(row.photo_version || 0),
    hasPhoto: Boolean(String(row.photo_path || '').trim() || String(row.photo_url || '').trim()),
  };
  if (slim) {
    return {
      ...base,
      __listSlim: true,
      photo: '',
      paymentHistory: children.payments || [],
      messageHistory: [],
      attachments: [],
    };
  }
  return {
    ...base,
    photo: row.photo_url,
    medicalAnswers: Object.keys(medical).length ? medical : undefined,
    ackSignature: row.ack_signature,
    parentGuardianSignature: row.parent_guardian_signature,
    paymentHistory: children.payments || [],
    messageHistory: children.messages || [],
    attachments: children.attachments || [],
  };
}

/** Strip heavy nested fields from an app-shaped member for sqlite list parity. */
export function slimAppMember(m) {
  if (!m || typeof m !== 'object') return m;
  const {
    photo,
    paymentHistory,
    messageHistory,
    attachments,
    ackSignature,
    parentGuardianSignature,
    medicalAnswers,
    ...rest
  } = m;
  return {
    ...rest,
    __listSlim: true,
    paymentHistory: Array.isArray(paymentHistory) ? paymentHistory : [],
    messageHistory: [],
    attachments: [],
  };
}

export function appMemberToRow(m, gymId) {
  const updatedAt = toTs(m.updatedAt) || new Date().toISOString();
  const createdAt = toTs(m.createdAt) || updatedAt;
  const medical = m.medicalAnswers && typeof m.medicalAnswers === 'object'
    ? { ...m.medicalAnswers }
    : null;
  if (medical?.injuryNotesLog) {
    delete medical.injuryNotesLog;
  }
  return {
    gym_id: gymId,
    member_code: String(m.memberId || '').trim(),
    form_no: Number.isFinite(Number(m.formNo)) ? Number(m.formNo) : null,
    full_name: emptyText(m.name) || 'Unknown',
    email: emptyText(m.email),
    mobile: emptyText(m.mobile),
    dob: toDate(m.dob, { required: true }),
    gender: emptyText(m.gender),
    address: emptyText(m.address),
    assigned_staff: emptyText(m.staff),
    plan_name: emptyText(m.plan),
    status: String(m.status || 'Active'),
    hold_duration: emptyText(m.holdDuration),
    amount: Number(m.amount || 0),
    payment_method: emptyText(m.paymentMethod),
    joining_date: toDate(m.joiningDate),
    billing_date: toDate(m.billingDate),
    billing_date_updated_at: toTs(m.billingDateUpdatedAt) || updatedAt,
    next_payment_date: toDate(m.nextPaymentDate),
    payment_by: toDate(m.paymentBy),
    pay_month: emptyText(m.payMonth),
    remark: emptyText(m.remark),
    photo_url: m.photo || null,
    medical_skipped: Boolean(m.medicalSkipped),
    medical_answers_json: medical,
    ack_accepted: Boolean(m.ackAccepted),
    ack_signature: emptyText(m.ackSignature),
    ack_date: toDate(m.ackDate),
    parent_guardian_name: emptyText(m.parentGuardianName),
    parent_guardian_dob: toDate(m.parentGuardianDob),
    parent_guardian_signature: emptyText(m.parentGuardianSignature),
    family_group_id: m.familyGroupId || null,
    family_primary_member_id: m.familyPrimaryMemberId || null,
    last_sms_sent_json: m.lastSmsSent || null,
    updated_by: emptyText(m.updatedBy),
    assigned_gym_code_id: m.assignedGymCodeId ? String(m.assignedGymCodeId).trim() : null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function paymentRowToApp(row) {
  return {
    id: row.external_payment_id || String(row.id),
    paidAt: row.paid_at,
    receivedAt: row.paid_at,
    date: row.paid_at,
    amount: Number(row.amount || 0),
    method: row.method,
    paymentMethod: row.method,
    billingMonth: row.billing_month,
    billingDate: row.billing_date,
    recordedBy: row.recorded_by,
    by: row.recorded_by,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function messageRowToApp(row) {
  const payload = row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {};
  return {
    ...payload,
    id: row.external_event_id || payload.id || String(row.id),
    channel: row.channel || payload.channel,
    templateKey: row.template_key || payload.templateKey,
    status: row.status || payload.status,
    sentAt: row.sent_at || payload.sentAt,
    ts: row.sent_at || payload.ts,
    sentBy: row.sent_by || payload.sentBy,
    by: row.sent_by || payload.by,
  };
}

export function attachmentRowToApp(row) {
  return {
    id: String(row.id),
    name: row.file_name,
    mime: row.mime_type,
    size: row.file_size,
    dataUrl: row.storage_path,
    uploadedAt: row.uploaded_at,
  };
}

export function passwordResetStatusFromTimestamps(requestedAt, approvedAt, rejectedAt = '') {
  return passwordResetStatusFromRecord({
    passwordResetRequestedAt: requestedAt,
    passwordResetApprovedAt: approvedAt,
    passwordResetRejectedAt: rejectedAt,
  });
}

export function staffRowToApp(row, sections = [], access = {}, assignedBranchIds = null) {
  const passwordResetRequestedAt = row.password_reset_requested_at || '';
  const passwordResetApprovedAt = row.password_reset_approved_at || '';
  const passwordResetRejectedAt = row.password_reset_rejected_at || '';
  const passwordResetRejectedBy = row.password_reset_rejected_by || '';
  return {
    id: row.staff_login_id,
    name: row.full_name,
    email: row.email || '',
    sections,
    access,
    blocked: Boolean(row.is_blocked),
    blockedReason: row.blocked_reason || '',
    blockedAt: row.blocked_at || '',
    updatedBy: row.updated_by || '',
    photo: row.photo_url || null,
    testProfile: Boolean(row.is_test_profile),
    sandboxId: row.sandbox_id || '',
    passwordResetRequestedAt,
    passwordResetApprovedAt,
    passwordResetRejectedAt,
    passwordResetRejectedBy,
    passwordResetStatus: passwordResetStatusFromRecord({
      passwordResetRequestedAt,
      passwordResetApprovedAt,
      passwordResetRejectedAt,
    }),
    lastLoginAt: row.last_login_at || '',
    gymCodeId: row.gym_code_id || null,
    staffRole: row.staff_role || 'staff',
    assignedBranchIds: Array.isArray(assignedBranchIds) && assignedBranchIds.length
      ? [...assignedBranchIds]
      : (row.gym_code_id ? [String(row.gym_code_id)] : []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function appStaffToRow(u, gymId) {
  const updatedAt = toTs(u.updatedAt) || new Date().toISOString();
  const photoRaw = String(u.photo || u.avatar || '').trim();
  const photo_url = photoRaw && photoRaw.length <= 2_000_000 ? photoRaw : null;
  const row = {
    gym_id: gymId,
    staff_login_id: String(u.id || '').trim(),
    full_name: String(u.name || u.id || 'Staff').trim(),
    email: u.email || null,
    is_blocked: Boolean(u.blocked),
    is_test_profile: Boolean(u.testProfile),
    blocked_reason: u.blockedReason || null,
    blocked_at: toTs(u.blockedAt),
    updated_by: u.updatedBy || null,
    photo_url,
    sandbox_id: u.sandboxId || null,
    password_reset_requested_at: toTs(u.passwordResetRequestedAt),
    password_reset_approved_at: toTs(u.passwordResetApprovedAt),
    password_reset_rejected_at: toTs(u.passwordResetRejectedAt),
    password_reset_rejected_by: u.passwordResetRejectedBy || null,
    last_login_at: toTs(u.lastLoginAt),
    created_at: toTs(u.createdAt) || updatedAt,
    updated_at: updatedAt,
  };
  if (u.gymCodeId) row.gym_code_id = String(u.gymCodeId).trim();
  if (u.staffRole) row.staff_role = String(u.staffRole).trim();
  return row;
}

export function financeRowToApp(row) {
  const note = String(row.note || '');
  const status = financeStatusFromNumeric(row.status, note);
  const cleanNote = note.replace(/^\s*status:\w+\s*\|\s*/i, '').trim();
  return {
    id: row.external_tx_id || String(row.id),
    type: row.tx_type === 'expense' ? 'expense' : 'income',
    source: row.source || 'manual',
    memberId: row.member_code || '',
    memberName: row.member_name || '',
    date: row.tx_date,
    plan: row.plan_name || '',
    method: row.method || '',
    amount: Number(row.amount || 0),
    status,
    category: row.category || '',
    note: cleanNote,
    memberStatus: '',
    createdAt: row.created_at,
  };
}

export function appFinanceToRow(t, gymId, memberId = null) {
  const statusNote = t.status ? `status:${t.status}` : '';
  const note = [statusNote, emptyText(t.note)].filter(Boolean).join(' | ');
  return {
    gym_id: gymId,
    external_tx_id: t.id ? String(t.id) : crypto.randomUUID(),
    tx_type: t.type === 'expense' ? 'expense' : 'income',
    source: emptyText(t.source) || 'manual',
    member_id: memberId,
    member_code: emptyText(t.memberId),
    member_name: emptyText(t.memberName),
    tx_date: toDate(t.date, { required: true }),
    plan_name: emptyText(t.plan),
    method: emptyText(t.method),
    amount: Number(t.amount || 0),
    status: financeStatusToNumeric(t.status),
    category: emptyText(t.category),
    note,
    created_at: toTs(t.createdAt) || new Date().toISOString(),
  };
}

export function logRowToApp(row, options = {}) {
  const slim = Boolean(options.slim);
  const base = {
    id: row.external_log_id || String(row.id),
    actor: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ts: row.logged_at,
  };
  if (slim) return base;
  return {
    ...base,
    before: row.before_json,
    after: row.after_json,
  };
}

export function appLogToRow(l, gymId) {
  return {
    gym_id: gymId,
    external_log_id: l.id ? String(l.id) : crypto.randomUUID(),
    actor_name: String(l.actor || 'Unknown'),
    action: String(l.action || ''),
    entity_type: String(l.entityType || ''),
    entity_id: l.entityId ? String(l.entityId) : null,
    before_json: l.before || null,
    after_json: l.after || null,
    logged_at: toTs(l.ts) || new Date().toISOString(),
  };
}

export function smsRowToApp(row) {
  return {
    id: row.external_event_id || String(row.id),
    memberId: row.member_code || '',
    memberName: row.member_name || '',
    fromStatus: row.from_status || '',
    toStatus: row.to_status || '',
    templateKey: row.template_key || '',
    message: row.message || '',
    waUrl: row.wa_url || '',
    ts: row.event_at,
  };
}

export function appSmsToRow(e, gymId) {
  return {
    gym_id: gymId,
    external_event_id: e.id ? String(e.id) : crypto.randomUUID(),
    member_code: e.memberId || null,
    member_name: e.memberName || null,
    from_status: e.fromStatus || null,
    to_status: e.toStatus || null,
    template_key: e.templateKey || null,
    message: e.message || null,
    wa_url: e.waUrl || null,
    event_at: toTs(e.ts) || new Date().toISOString(),
  };
}

export function visitorRowToApp(row) {
  return {
    id: row.external_visitor_id,
    fullName: row.full_name,
    email: row.email,
    mobile: row.mobile,
    dob: row.dob,
    gender: row.gender,
    status: row.status,
    callBackRequired: Boolean(row.call_back_required),
    tentativeJoiningDate: row.tentative_joining_date,
    lastCalledAt: row.last_called_at,
    lastCalledBy: row.last_called_by,
    assignedGymCodeId: row.assigned_gym_code_id || null,
    addedAt: row.added_at,
  };
}

export function appVisitorToRow(v, gymId) {
  return {
    gym_id: gymId,
    external_visitor_id: String(v.id || crypto.randomUUID()),
    full_name: String(v.fullName || '').trim(),
    email: String(v.email || '').trim(),
    mobile: String(v.mobile || '').trim(),
    dob: toDate(v.dob),
    gender: v.gender || null,
    status: String(v.status || 'New'),
    call_back_required: Boolean(v.callBackRequired),
    tentative_joining_date: toDate(v.tentativeJoiningDate),
    last_called_at: toTs(v.lastCalledAt),
    last_called_by: v.lastCalledBy || null,
    assigned_gym_code_id: v.assignedGymCodeId ? String(v.assignedGymCodeId).trim() : null,
    added_at: toTs(v.addedAt),
    created_at: toTs(v.addedAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
