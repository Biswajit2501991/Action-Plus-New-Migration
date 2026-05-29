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
  authIsMasterOwnerUser,
  authIsBranchOwnerUser,
  staffHasBranch,
  scopeMembersForBulkSync,
  scopeVisitorsForBulkSync,
} from '../features/branch/branchAccess.js';
import {
  authIsBranchAdminUser,
  allowedBranchIdsForUser,
  userCanAccessBranch,
  canDeleteMemberForUser,
} from '../features/tenant/branchOwnerAccess.js';
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
  scrollEditorToTop,
  bindModalEscapeKey,
  bindFocusTrap,
  EDITOR_MODAL_Z_INDEX,
  PHOTO_PICKER_MODAL_Z_INDEX,
} from '../features/modal/editorModalShell.js';
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
import {
  resolveClientBranchBranding,
  defaultClientBranding,
  DEFAULT_LOGO_PATH,
  DEFAULT_GYM_DISPLAY_NAME,
} from '../features/branding/branchBranding.js';
import {
  switchableBranchesForUser,
  shouldShowBranchSwitcher,
  effectiveActiveBranchId,
  primaryBranchIdForLogin,
  readActiveBranchPref,
  writeActiveBranchPref,
} from '../features/branding/activeBranchContext.js';
import {
  shouldReplaceBranchDataOnHydrate,
  mergeMembersAfterBranchReplace,
  mergeVisitorsAfterBranchReplace,
} from '../features/tenant/branchSwitchCoordinator.js';
import { activeBranchIdsForDataScope } from '../features/tenant/branchOwnerAccess.js';
import {
  measureAnchoredPopoverCoords,
  ANCHORED_POPOVER_LAYER_CLASS,
  ANCHORED_POPOVER_Z_INDEX,
} from '../features/overlay/anchoredPopoverCoords.js';

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

async function loadLeaveTrackerModuleFromPrebuilt() {
  const url = new URL('../../dist-legacy/modules/LeaveTrackerPageModule.js', import.meta.url);
  if (url.origin !== window.location.origin) throw new Error('prebuilt-cross-origin-blocked');
  const mod = await import(url.href);
  return mod.default || mod;
}

async function fetchLeaveTrackerSource() {
  const url = new URL('../components/LeaveTrackerPageModule.jsx', import.meta.url);
  if (url.origin !== window.location.origin) throw new Error('source-cross-origin-blocked');
  const res = await fetch(url.href, { cache: 'no-store' });
  if (!res.ok) throw new Error(`source-http-${res.status}`);
  const text = await res.text();
  if (!text.includes('export default')) throw new Error('source-invalid-module-shape');
  return text;
}

async function loadLeaveTrackerModuleWithRetry(maxAttempts = 3) {
  try {
    const prebuilt = await loadLeaveTrackerModuleFromPrebuilt();
    emitTelemetry('info', 'prebuilt-load', 'Loaded prebuilt Leave Tracker module');
    return prebuilt;
  } catch (err) {
    emitTelemetry('warn', 'prebuilt-miss', 'Prebuilt Leave Tracker module unavailable, using fallback loader', {
      error: String(err?.message || err),
    });
  }

  if (!window.Babel) throw new Error('fallback-babel-missing');
  if (!window.React) throw new Error('fallback-react-missing');

  const source = await fetchLeaveTrackerSource();
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
window.__APG_MODULES.authIsMasterOwnerUser = authIsMasterOwnerUser;
window.__APG_MODULES.authIsBranchOwnerUser = authIsBranchOwnerUser;
window.__APG_MODULES.authIsBranchAdminUser = authIsBranchAdminUser;
window.__APG_MODULES.allowedBranchIdsForUser = allowedBranchIdsForUser;
window.__APG_MODULES.userCanAccessBranch = userCanAccessBranch;
window.__APG_MODULES.canDeleteMemberForUser = canDeleteMemberForUser;
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
window.__APG_MODULES.scrollEditorToTop = scrollEditorToTop;
window.__APG_MODULES.bindModalEscapeKey = bindModalEscapeKey;
window.__APG_MODULES.bindFocusTrap = bindFocusTrap;
window.__APG_MODULES.EDITOR_MODAL_Z_INDEX = EDITOR_MODAL_Z_INDEX;
window.__APG_MODULES.PHOTO_PICKER_MODAL_Z_INDEX = PHOTO_PICKER_MODAL_Z_INDEX;
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
window.__APG_MODULES.resolveClientBranchBranding = resolveClientBranchBranding;
window.__APG_MODULES.defaultClientBranding = defaultClientBranding;
window.__APG_MODULES.DEFAULT_LOGO_PATH = DEFAULT_LOGO_PATH;
window.__APG_MODULES.DEFAULT_GYM_DISPLAY_NAME = DEFAULT_GYM_DISPLAY_NAME;
window.__APG_MODULES.switchableBranchesForUser = switchableBranchesForUser;
window.__APG_MODULES.shouldShowBranchSwitcher = shouldShowBranchSwitcher;
window.__APG_MODULES.effectiveActiveBranchId = effectiveActiveBranchId;
window.__APG_MODULES.readActiveBranchPref = readActiveBranchPref;
window.__APG_MODULES.writeActiveBranchPref = writeActiveBranchPref;
window.__APG_MODULES.primaryBranchIdForLogin = primaryBranchIdForLogin;
window.__APG_MODULES.activeBranchIdsForDataScope = activeBranchIdsForDataScope;
window.__APG_MODULES.shouldReplaceBranchDataOnHydrate = shouldReplaceBranchDataOnHydrate;
window.__APG_MODULES.mergeMembersAfterBranchReplace = mergeMembersAfterBranchReplace;
window.__APG_MODULES.mergeVisitorsAfterBranchReplace = mergeVisitorsAfterBranchReplace;
window.__APG_MODULES.measureAnchoredPopoverCoords = measureAnchoredPopoverCoords;
window.__APG_MODULES.ANCHORED_POPOVER_LAYER_CLASS = ANCHORED_POPOVER_LAYER_CLASS;
window.__APG_MODULES.ANCHORED_POPOVER_Z_INDEX = ANCHORED_POPOVER_Z_INDEX;
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
