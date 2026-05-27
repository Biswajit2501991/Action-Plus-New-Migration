import * as permissions from '../features/access/permissions.js';
import { reminderSentForCurrentBilling, toCalendarDateKey } from '../features/members/reminderBillingCycle.js';
import { leaveSubmitErrorMessage } from '../features/leave/leaveSubmitError.js';
import { createLeaveApprovalHandlers } from '../features/leave/leaveApprovalHandlers.js';
import {
  patchLeaveRequestStatus,
  mergeLeaveRequestIntoList,
  normalizeLeaveRequestFromApi,
  mergeApprovedLeaveIntoAttendance,
} from '../features/leave/leaveApprovalSync.js';
import LeaveApprovalNotificationCard from '../components/leave/LeaveApprovalNotificationCard.js';
import LeaveApprovalStatusBadge from '../components/leave/LeaveApprovalStatusBadge.js';
import {
  filterMembersForUser,
  filterVisitorsForUser,
  memberInStaffBranch,
  authIsOwnerUser,
  staffHasBranch,
  scopeMembersForBulkSync,
  scopeVisitorsForBulkSync,
} from '../features/branch/branchAccess.js';
import {
  resolveDefaultAssignedGymCodeId,
  enforceStaffBranchOnForm,
  sanitizeAddMemberDraftForm,
} from '../features/branch/branchDefaultResolver.js';
import {
  addMemberDraftKeyForUser,
  loadAddMemberDraft,
  saveAddMemberDraft,
  clearAddMemberDraft,
} from '../features/forms/addMemberDraft.js';
import {
  EDIT_MEMBER_DIRTY_KEYS,
  isMemberFormDirty,
  memberFormChangedMap,
  memberEditBaselineKey,
  normalizeBranchId,
} from '../features/members/formDirtyState.js';
import {
  nextBranchFormNumber,
  branchCodeToken,
  buildBranchMemberId,
} from '../features/members/branchFormNumber.js';
import {
  authIsOwnerUser as authIsOwnerUserWhatsapp,
  staffMayEditWhatsappTemplates,
  effectiveTemplateBranchIdForUser,
  resolveMemberTemplateFromCache,
} from '../features/whatsapp/branchTemplateAccess.js';
import { WHATSAPP_TEMPLATE_KEYS } from '../features/whatsapp/templateKeys.js';

function emitTelemetry(level, code, message, meta = {}) {
  const payload = {
    level,
    code,
    message,
    meta,
    ts: new Date().toISOString(),
  };
  window.__APG_MODULE_TELEMETRY = window.__APG_MODULE_TELEMETRY || [];
  window.__APG_MODULE_TELEMETRY.unshift(payload);
  window.__APG_MODULE_TELEMETRY = window.__APG_MODULE_TELEMETRY.slice(0, 100);
  window.dispatchEvent(new CustomEvent('apg:module-loader', { detail: payload }));
}

async function precheckLeaveTrackerModule() {
  const url = new URL('../components/LeaveTrackerPageModule.jsx', import.meta.url);
  if (url.origin !== window.location.origin) throw new Error('precheck-cross-origin-blocked');
  if (!window.React) throw new Error('precheck-react-missing');
  if (!window.Babel) throw new Error('precheck-babel-missing');
  const res = await fetch(url.href, { cache: 'no-store' });
  if (!res.ok) throw new Error(`precheck-http-${res.status}`);
  const text = await res.text();
  if (!text.includes('export default')) throw new Error('precheck-invalid-module-shape');
  return { url: url.href, source: text };
}

async function loadLeaveTrackerModuleFromSource(source) {
  const compiled = window.Babel.transform(source, {
    presets: [['env', { modules: 'commonjs' }], 'react'],
  }).code;
  const module = { exports: {} };
  const req = (name) => {
    if (name === 'react') return window.React;
    throw new Error(`Unsupported runtime require: ${name}`);
  };
  const factory = new Function('module', 'exports', 'require', 'React', `${compiled}\nreturn module.exports;`);
  const out = factory(module, module.exports, req, window.React);
  return out.default || out;
}

async function loadLeaveTrackerModuleWithRetry(maxAttempts = 3) {
  const { source } = await precheckLeaveTrackerModule();
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) emitTelemetry('warn', 'retry', `Retrying Leave Tracker module load (${attempt}/${maxAttempts})`, { attempt, maxAttempts });
      return await loadLeaveTrackerModuleFromSource(source);
    } catch (err) {
      lastErr = err;
      emitTelemetry('warn', 'load-attempt-failed', `Leave Tracker module load attempt ${attempt} failed`, { attempt, error: String(err?.message || err) });
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastErr || new Error('leave-tracker-load-failed');
}

// Sync registration first so notification approve works before Leave Tracker JSX loads.
window.__APG_MODULES = window.__APG_MODULES || {};
window.__APG_MODULES.permissions = permissions;
window.__APG_MODULES.ALL_SECTIONS = permissions.ALL_SECTIONS;
window.__APG_MODULES.DASHBOARD_CHILD_PERMISSIONS = permissions.DASHBOARD_CHILD_PERMISSIONS;
window.__APG_MODULES.DEFAULT_ACCESS = permissions.DEFAULT_ACCESS;
window.__APG_MODULES.normalizeAccess = permissions.normalizeAccess;
window.__APG_MODULES.sectionsWithRoleDefaults = permissions.sectionsWithRoleDefaults;
window.__APG_MODULES.reminderSentForCurrentBilling = reminderSentForCurrentBilling;
window.__APG_MODULES.toCalendarDateKey = toCalendarDateKey;
window.__APG_MODULES.leaveSubmitErrorMessage = leaveSubmitErrorMessage;
window.__APG_MODULES.createLeaveApprovalHandlers = createLeaveApprovalHandlers;
window.__APG_MODULES.patchLeaveRequestStatus = patchLeaveRequestStatus;
window.__APG_MODULES.mergeLeaveRequestIntoList = mergeLeaveRequestIntoList;
window.__APG_MODULES.normalizeLeaveRequestFromApi = normalizeLeaveRequestFromApi;
window.__APG_MODULES.mergeApprovedLeaveIntoAttendance = mergeApprovedLeaveIntoAttendance;
window.__APG_MODULES.LeaveApprovalNotificationCard = LeaveApprovalNotificationCard;
window.__APG_MODULES.LeaveApprovalStatusBadge = LeaveApprovalStatusBadge;
window.__APG_MODULES.filterMembersForUser = filterMembersForUser;
window.__APG_MODULES.filterVisitorsForUser = filterVisitorsForUser;
window.__APG_MODULES.memberInStaffBranch = memberInStaffBranch;
window.__APG_MODULES.authIsOwnerUser = authIsOwnerUser;
window.__APG_MODULES.staffHasBranch = staffHasBranch;
window.__APG_MODULES.scopeMembersForBulkSync = scopeMembersForBulkSync;
window.__APG_MODULES.scopeVisitorsForBulkSync = scopeVisitorsForBulkSync;
window.__APG_MODULES.resolveDefaultAssignedGymCodeId = resolveDefaultAssignedGymCodeId;
window.__APG_MODULES.enforceStaffBranchOnForm = enforceStaffBranchOnForm;
window.__APG_MODULES.sanitizeAddMemberDraftForm = sanitizeAddMemberDraftForm;
window.__APG_MODULES.addMemberDraftKeyForUser = addMemberDraftKeyForUser;
window.__APG_MODULES.loadAddMemberDraft = loadAddMemberDraft;
window.__APG_MODULES.saveAddMemberDraft = saveAddMemberDraft;
window.__APG_MODULES.clearAddMemberDraft = clearAddMemberDraft;
window.__APG_MODULES.EDIT_MEMBER_DIRTY_KEYS = EDIT_MEMBER_DIRTY_KEYS;
window.__APG_MODULES.isMemberFormDirty = isMemberFormDirty;
window.__APG_MODULES.memberFormChangedMap = memberFormChangedMap;
window.__APG_MODULES.memberEditBaselineKey = memberEditBaselineKey;
window.__APG_MODULES.normalizeBranchId = normalizeBranchId;
window.__APG_MODULES.nextBranchFormNumber = nextBranchFormNumber;
window.__APG_MODULES.branchCodeToken = branchCodeToken;
window.__APG_MODULES.buildBranchMemberId = buildBranchMemberId;
window.__APG_MODULES.WHATSAPP_TEMPLATE_KEYS = WHATSAPP_TEMPLATE_KEYS;
window.__APG_MODULES.authIsOwnerUserWhatsapp = authIsOwnerUserWhatsapp;
window.__APG_MODULES.staffMayEditWhatsappTemplates = staffMayEditWhatsappTemplates;
window.__APG_MODULES.effectiveTemplateBranchIdForUser = effectiveTemplateBranchIdForUser;
window.__APG_MODULES.resolveMemberTemplateFromCache = resolveMemberTemplateFromCache;
// Legacy alias used in parts of index.html (typo: trailing underscores).
window.__APG_MODULES__ = window.__APG_MODULES;

async function register() {
  emitTelemetry('info', 'init', 'Module registration started');
  window.__APG_MODULES.LeaveTrackerPageModule = await loadLeaveTrackerModuleWithRetry(3);
  emitTelemetry('info', 'ready', 'Module registration completed');
}

register()
  .catch((err) => {
    emitTelemetry('error', 'fatal', 'APG module registration failed. Fallback mode enabled.', { error: String(err?.message || err) });
    console.error('APG module registration failed:', err);
  })
  .finally(() => {
    if (typeof window.__APG_RESOLVE_MODULES === 'function') window.__APG_RESOLVE_MODULES();
  });
