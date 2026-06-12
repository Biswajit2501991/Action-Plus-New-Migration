import * as permissions from '../features/access/permissions.js';
import { reminderSentForCurrentBilling, toCalendarDateKey } from '../features/members/reminderBillingCycle.js';
import { leaveSubmitErrorMessage } from '../features/leave/leaveSubmitError.js';
import { createLeaveApprovalHandlers } from '../features/leave/leaveApprovalHandlers.js';
import {
  patchLeaveRequestStatus,
  mergeLeaveRequestIntoList,
  normalizeLeaveRequestFromApi,
  mergeApprovedLeaveIntoAttendance,
  annualLeaveBalanceRemaining,
  mergeLeaveRequestsFromPull,
  leaveUserIdsMatch,
} from '../features/leave/leaveApprovalSync.js';
import { buildPtMonthCalendarCells } from '../features/pt/ptWorkoutCalendarGrid.js';
import { isPtEligibleMember, isPtPlanName } from '../features/pt/ptEligibility.js';
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
  addMemberDeleteTombstone,
  removeMemberDeleteTombstone,
  isMemberDeleteTombstoned,
  readMemberDeleteTombstones,
  reconcileMemberDeleteTombstones,
  tombstonedMembersStillOnServer,
  filterMembersExcludingTombstones,
  shouldKeepLocalOnlyMember,
  buildMembersFromServerWithPending,
  sanitizeMembersForDisplay,
} from '../features/members/memberDeleteTombstones.js';
import { mergeMemberDeltaIntoList } from '../features/members/memberDeltaPull.js';
import { confirmPaidForMonthAmountOverride } from '../features/members/paidForMonthOverrideModal.js';
import {
  membersListFromServerHydrate,
  membersListFromServerDelta,
} from '../features/members/memberListSync.js';
import {
  fetchAuditLogsFromBackend,
  DEFAULT_AUDIT_LOGS_QUERY,
} from '../features/audit/auditLogsFetch.js';
import { mergeAuditLogs } from '../features/audit/auditLogMerge.js';
import {
  scrollEditorToTop,
  bindModalEscapeKey,
  bindFocusTrap,
  EDITOR_MODAL_Z_INDEX,
  PHOTO_PICKER_MODAL_Z_INDEX,
  PHOTO_PREVIEW_MODAL_Z_INDEX,
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
import { staffRoleDisplayLabel } from '../features/branding/staffRoleLabel.js';
import { buildHeaderBranchSwitcherModel } from '../features/branding/headerBranchSwitcherModel.js';
import { staffInitialsFromName, staffPhotoSrcFromUser } from '../features/branding/staffAvatarInitials.js';
import {
  shouldReplaceBranchDataOnHydrate,
  mergeMembersAfterBranchReplace,
  mergeVisitorsAfterBranchReplace,
  scopeMembersToUserBranch,
  scopeVisitorsToUserBranch,
} from '../features/tenant/branchSwitchCoordinator.js';
import { orchestrateBranchSwitch } from '../features/tenant/branchSwitchOrchestrator.js';
import { branchCacheInvalidator } from '../features/tenant/branchCacheInvalidator.js';
import {
  activeBranchStore,
  getAuthoritativeActiveBranchId,
  applyAuthoritativeBranchToUser,
  syncActiveBranchFromAuthPayload,
  resetActiveBranchStore,
} from '../features/branding/activeBranchStore.js';
import {
  branchBrandingCache,
  resolveBranchBranding,
  resolveBrandingForActiveUser,
} from '../features/branding/branchBrandingCache.js';
import { activeBranchIdsForDataScope } from '../features/tenant/branchOwnerAccess.js';
import {
  measureAnchoredPopoverCoords,
  ANCHORED_POPOVER_LAYER_CLASS,
  ANCHORED_POPOVER_Z_INDEX,
} from '../features/overlay/anchoredPopoverCoords.js';
import {
  PASSWORD_RESET_STATUS,
  canViewPasswordResetNotifications,
  isPasswordResetPendingUser,
  passwordResetStatusFromRecord,
} from '../features/passwordReset/passwordResetStatus.js';
import { createPasswordResetDecisionHandlers } from '../features/passwordReset/passwordResetDecisionHandlers.js';
import {
  patchUserAfterPasswordResetApprove,
  patchUserAfterPasswordResetReject,
  patchUserAfterPasswordResetRequest,
} from '../features/passwordReset/passwordResetUserPatch.js';
import PasswordResetNotificationCard from '../components/passwordReset/PasswordResetNotificationCard.js';
import { sumMonthlyCollectedRevenue } from '../features/finance/monthlyRevenue.js';
import {
  buildCollectedRevenueEntries,
  buildAllFinanceRevenueEntries,
  buildManualIncomeRevenueEntries,
  collectMemberRevenueEntries,
} from '../features/finance/collectedRevenue.js';
import {
  buildPaymentIncomeLedgerRows,
  buildBillingPendingLedgerRows,
  mapManualFinanceLedgerRows,
} from '../features/finance/financeLedger.js';
import {
  filterLedgerRowsByDateRange,
  sumCollectedIncomeForMonthKey,
  sumLedgerIncomeForMonthKey,
  sumLedgerRowAmounts,
  sumServiceRevenueForPaidMonthKey,
} from '../features/finance/financeLedgerTotals.js';
import { buildFinanceLedgerRows } from '../features/finance/buildFinanceLedger.js';
import {
  buildFinanceKpis,
  revenueGrowthPercent,
  shiftFinanceMonthKey,
  sumYtdCollectedIncome,
} from '../features/finance/buildFinanceKpis.js';
import {
  buildMonthlyReconciliation,
  buildRollingMonthlyReconciliation,
} from '../features/finance/buildMonthlyReconciliation.js';
import {
  buildRevenueBreakdown,
  classifyRevenueBucket,
  ptClientMemberIdSet,
} from '../features/finance/revenueBreakdown.js';
import { buildExpenseBreakdown } from '../features/finance/expenseBreakdown.js';
import { financeSummaryDelta } from '../features/finance/aggregateFinanceSummary.js';
import {
  financeMonthBoundsFromKey,
  lastFourMonthTrendSlots,
  parseFinanceMonthKey,
} from '../features/finance/financeMonthScope.js';
import {
  paymentMonthKeyFromValue,
  billingDateFromPaymentMonth,
} from '../features/finance/paymentMonthKey.js';
import {
  derivePaidMonthFromBilling,
  resolvePaidMonthForPayment,
  validatePaidMonthKey,
  payMonthKeyFromStoredValue,
  formatPaidMonthDisplay,
} from '../features/finance/derivePaidMonth.js';
import { applyPaymentHistoryBackfillToMember } from '../features/members/paymentHistoryLegacyBackfill.js';
import {
  filterPaymentRowsByMonth,
  paymentHistoryMonthOptions,
  sumPaymentRowAmounts,
} from '../features/members/paymentHistoryFilters.js';
import {
  buildMembershipPlanDistribution,
  normalizePlanName,
  planDistributionConicGradient,
} from '../features/analytics/planDistribution.js';
import { pickMergedPaymentHistory } from '../features/members/paymentHistoryMerge.js';
/** Bump when memberPhotoApi exports change — separate URL bypasses stale bare-path module cache. */
import * as memberPhotoApiInitial from '../features/members/memberPhotoApi.js?v=5';
import {
  resolveMemberAvatarSrc,
  mergeMemberPhotoFields,
} from '../features/members/memberAvatarResolver.js';
import {
  getCachedMemberPhotoUrl,
  setCachedMemberPhotoUrl,
  invalidateMemberPhotoCache,
  applyBatchPhotoUrls,
} from '../features/members/photoUrlCache.js';

function memberPhotoApiHasSyncExports(api) {
  return typeof api?.syncAllMemberPhotoUrls === 'function'
    && typeof api?.memberIdsNeedingPhotoUrlsAll === 'function';
}

async function resolveMemberPhotoApi() {
  if (memberPhotoApiHasSyncExports(memberPhotoApiInitial)) return memberPhotoApiInitial;
  const bust = typeof window.__APG_ESM_CACHE_BUST === 'string'
    ? window.__APG_ESM_CACHE_BUST
    : String(Date.now());
  try {
    const mod = await import(`../features/members/memberPhotoApi.js?v=${bust}`);
    if (memberPhotoApiHasSyncExports(mod)) return mod;
  } catch (err) {
    emitTelemetry('warn', 'member-photo-api-reload', 'Failed to reload memberPhotoApi after stale cache', {
      error: String(err?.message || err),
    });
  }
  return memberPhotoApiInitial;
}

function registerMemberPhotoModules(api) {
  window.__APG_MODULES.memberPhotoStorageEnabled = api.memberPhotoStorageEnabled;
  window.__APG_MODULES.uploadMemberPhotoApi = api.uploadMemberPhotoApi;
  window.__APG_MODULES.deleteMemberPhotoApi = api.deleteMemberPhotoApi;
  window.__APG_MODULES.batchFetchMemberPhotoUrls = api.batchFetchMemberPhotoUrls;
  window.__APG_MODULES.syncAllMemberPhotoUrls = api.syncAllMemberPhotoUrls;
  window.__APG_MODULES.memberIdsNeedingPhotoUrlsAll = api.memberIdsNeedingPhotoUrlsAll;
}

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

  if (!window.Babel || !window.React) {
    emitTelemetry('warn', 'leave-tracker-stub', 'Leave Tracker unavailable in prod bundle (Babel not loaded)');
    return null;
  }

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
window.__APG_MODULES.annualLeaveBalanceRemaining = annualLeaveBalanceRemaining;
window.__APG_MODULES.mergeLeaveRequestsFromPull = mergeLeaveRequestsFromPull;
window.__APG_MODULES.leaveUserIdsMatch = leaveUserIdsMatch;
window.__APG_MODULES.buildPtMonthCalendarCells = buildPtMonthCalendarCells;
window.__APG_MODULES.isPtEligibleMember = isPtEligibleMember;
window.__APG_MODULES.isPtPlanName = isPtPlanName;
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
window.__APG_MODULES.addMemberDeleteTombstone = addMemberDeleteTombstone;
window.__APG_MODULES.removeMemberDeleteTombstone = removeMemberDeleteTombstone;
window.__APG_MODULES.isMemberDeleteTombstoned = isMemberDeleteTombstoned;
window.__APG_MODULES.readMemberDeleteTombstones = readMemberDeleteTombstones;
window.__APG_MODULES.reconcileMemberDeleteTombstones = reconcileMemberDeleteTombstones;
window.__APG_MODULES.tombstonedMembersStillOnServer = tombstonedMembersStillOnServer;
window.__APG_MODULES.filterMembersExcludingTombstones = filterMembersExcludingTombstones;
window.__APG_MODULES.shouldKeepLocalOnlyMember = shouldKeepLocalOnlyMember;
window.__APG_MODULES.buildMembersFromServerWithPending = buildMembersFromServerWithPending;
window.__APG_MODULES.mergeMemberDeltaIntoList = mergeMemberDeltaIntoList;
window.__APG_MODULES.confirmPaidForMonthAmountOverride = confirmPaidForMonthAmountOverride;
window.__APG_MODULES.sanitizeMembersForDisplay = sanitizeMembersForDisplay;
window.__APG_MODULES.membersListFromServerHydrate = membersListFromServerHydrate;
window.__APG_MODULES.membersListFromServerDelta = membersListFromServerDelta;
window.__APG_MODULES.fetchAuditLogsFromBackend = fetchAuditLogsFromBackend;
window.__APG_MODULES.mergeAuditLogs = mergeAuditLogs;
window.__APG_MODULES.DEFAULT_AUDIT_LOGS_QUERY = DEFAULT_AUDIT_LOGS_QUERY;
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
window.__APG_MODULES.PHOTO_PREVIEW_MODAL_Z_INDEX = PHOTO_PREVIEW_MODAL_Z_INDEX;
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
window.__APG_MODULES.staffRoleDisplayLabel = staffRoleDisplayLabel;
window.__APG_MODULES.staffInitialsFromName = staffInitialsFromName;
window.__APG_MODULES.staffPhotoSrcFromUser = staffPhotoSrcFromUser;
window.__APG_MODULES.buildHeaderBranchSwitcherModel = buildHeaderBranchSwitcherModel;
window.__APG_MODULES.activeBranchIdsForDataScope = activeBranchIdsForDataScope;
window.__APG_MODULES.shouldReplaceBranchDataOnHydrate = shouldReplaceBranchDataOnHydrate;
window.__APG_MODULES.mergeMembersAfterBranchReplace = mergeMembersAfterBranchReplace;
window.__APG_MODULES.mergeVisitorsAfterBranchReplace = mergeVisitorsAfterBranchReplace;
window.__APG_MODULES.scopeMembersToUserBranch = scopeMembersToUserBranch;
window.__APG_MODULES.scopeVisitorsToUserBranch = scopeVisitorsToUserBranch;
window.__APG_MODULES.orchestrateBranchSwitch = orchestrateBranchSwitch;
window.__APG_MODULES.branchCacheInvalidator = branchCacheInvalidator;
window.__APG_MODULES.activeBranchStore = activeBranchStore;
window.__APG_MODULES.getAuthoritativeActiveBranchId = getAuthoritativeActiveBranchId;
window.__APG_MODULES.applyAuthoritativeBranchToUser = applyAuthoritativeBranchToUser;
window.__APG_MODULES.syncActiveBranchFromAuthPayload = syncActiveBranchFromAuthPayload;
window.__APG_MODULES.resetActiveBranchStore = resetActiveBranchStore;
window.__APG_MODULES.branchBrandingCache = branchBrandingCache;
window.__APG_MODULES.resolveBranchBranding = resolveBranchBranding;
window.__APG_MODULES.resolveBrandingForActiveUser = resolveBrandingForActiveUser;
window.__APG_MODULES.measureAnchoredPopoverCoords = measureAnchoredPopoverCoords;
window.__APG_MODULES.ANCHORED_POPOVER_LAYER_CLASS = ANCHORED_POPOVER_LAYER_CLASS;
window.__APG_MODULES.ANCHORED_POPOVER_Z_INDEX = ANCHORED_POPOVER_Z_INDEX;
window.__APG_MODULES.PASSWORD_RESET_STATUS = PASSWORD_RESET_STATUS;
window.__APG_MODULES.passwordResetStatusFromRecord = passwordResetStatusFromRecord;
window.__APG_MODULES.isPasswordResetPendingUser = isPasswordResetPendingUser;
window.__APG_MODULES.canViewPasswordResetNotifications = canViewPasswordResetNotifications;
window.__APG_MODULES.createPasswordResetDecisionHandlers = createPasswordResetDecisionHandlers;
window.__APG_MODULES.patchUserAfterPasswordResetApprove = patchUserAfterPasswordResetApprove;
window.__APG_MODULES.patchUserAfterPasswordResetReject = patchUserAfterPasswordResetReject;
window.__APG_MODULES.patchUserAfterPasswordResetRequest = patchUserAfterPasswordResetRequest;
window.__APG_MODULES.PasswordResetNotificationCard = PasswordResetNotificationCard;
window.__APG_MODULES.sumMonthlyCollectedRevenue = sumMonthlyCollectedRevenue;
window.__APG_MODULES.collectMemberRevenueEntries = collectMemberRevenueEntries;
window.__APG_MODULES.buildCollectedRevenueEntries = buildCollectedRevenueEntries;
window.__APG_MODULES.buildAllFinanceRevenueEntries = buildAllFinanceRevenueEntries;
window.__APG_MODULES.buildManualIncomeRevenueEntries = buildManualIncomeRevenueEntries;
window.__APG_MODULES.buildPaymentIncomeLedgerRows = buildPaymentIncomeLedgerRows;
window.__APG_MODULES.buildBillingPendingLedgerRows = buildBillingPendingLedgerRows;
window.__APG_MODULES.mapManualFinanceLedgerRows = mapManualFinanceLedgerRows;
window.__APG_MODULES.sumLedgerRowAmounts = sumLedgerRowAmounts;
window.__APG_MODULES.filterLedgerRowsByDateRange = filterLedgerRowsByDateRange;
window.__APG_MODULES.sumLedgerIncomeForMonthKey = sumLedgerIncomeForMonthKey;
window.__APG_MODULES.sumCollectedIncomeForMonthKey = sumCollectedIncomeForMonthKey;
window.__APG_MODULES.sumServiceRevenueForPaidMonthKey = sumServiceRevenueForPaidMonthKey;
window.__APG_MODULES.buildFinanceLedgerRows = buildFinanceLedgerRows;
window.__APG_MODULES.buildFinanceKpis = buildFinanceKpis;
window.__APG_MODULES.revenueGrowthPercent = revenueGrowthPercent;
window.__APG_MODULES.shiftFinanceMonthKey = shiftFinanceMonthKey;
window.__APG_MODULES.sumYtdCollectedIncome = sumYtdCollectedIncome;
window.__APG_MODULES.buildMonthlyReconciliation = buildMonthlyReconciliation;
window.__APG_MODULES.buildRollingMonthlyReconciliation = buildRollingMonthlyReconciliation;
window.__APG_MODULES.buildRevenueBreakdown = buildRevenueBreakdown;
window.__APG_MODULES.classifyRevenueBucket = classifyRevenueBucket;
window.__APG_MODULES.ptClientMemberIdSet = ptClientMemberIdSet;
window.__APG_MODULES.buildExpenseBreakdown = buildExpenseBreakdown;
window.__APG_MODULES.financeSummaryDelta = financeSummaryDelta;
window.__APG_MODULES.financeMonthBoundsFromKey = financeMonthBoundsFromKey;
window.__APG_MODULES.lastFourMonthTrendSlots = lastFourMonthTrendSlots;
window.__APG_MODULES.parseFinanceMonthKey = parseFinanceMonthKey;
window.__APG_MODULES.paymentMonthKeyFromValue = paymentMonthKeyFromValue;
window.__APG_MODULES.billingDateFromPaymentMonth = billingDateFromPaymentMonth;
window.__APG_MODULES.derivePaidMonthFromBilling = derivePaidMonthFromBilling;
window.__APG_MODULES.resolvePaidMonthForPayment = resolvePaidMonthForPayment;
window.__APG_MODULES.validatePaidMonthKey = validatePaidMonthKey;
window.__APG_MODULES.payMonthKeyFromStoredValue = payMonthKeyFromStoredValue;
window.__APG_MODULES.formatPaidMonthDisplay = formatPaidMonthDisplay;
window.__APG_MODULES.applyPaymentHistoryBackfillToMember = applyPaymentHistoryBackfillToMember;
window.__APG_MODULES.buildMembershipPlanDistribution = buildMembershipPlanDistribution;
window.__APG_MODULES.normalizePlanName = normalizePlanName;
window.__APG_MODULES.planDistributionConicGradient = planDistributionConicGradient;
window.__APG_MODULES.filterPaymentRowsByMonth = filterPaymentRowsByMonth;
window.__APG_MODULES.paymentHistoryMonthOptions = paymentHistoryMonthOptions;
window.__APG_MODULES.sumPaymentRowAmounts = sumPaymentRowAmounts;
window.__APG_MODULES.pickMergedPaymentHistory = pickMergedPaymentHistory;
window.__APG_MODULES.resolveMemberAvatarSrc = resolveMemberAvatarSrc;
window.__APG_MODULES.mergeMemberPhotoFields = mergeMemberPhotoFields;
window.__APG_MODULES.getCachedMemberPhotoUrl = getCachedMemberPhotoUrl;
window.__APG_MODULES.setCachedMemberPhotoUrl = setCachedMemberPhotoUrl;
window.__APG_MODULES.invalidateMemberPhotoCache = invalidateMemberPhotoCache;
window.__APG_MODULES.applyBatchPhotoUrls = applyBatchPhotoUrls;
// Legacy alias used in parts of index.html (typo: trailing underscores).
window.__APG_MODULES__ = window.__APG_MODULES;

async function register() {
  emitTelemetry('info', 'init', 'Module registration started');
  const memberPhotoApi = await resolveMemberPhotoApi();
  registerMemberPhotoModules(memberPhotoApi);
  if (!memberPhotoApiHasSyncExports(memberPhotoApi)) {
    emitTelemetry('warn', 'member-photo-api-partial', 'memberPhotoApi loaded without photo sync exports (stale cache?)');
  }
  // Core modules are registered — unblock app mount before LeaveTracker async load finishes.
  if (typeof window.__APG_RESOLVE_MODULES === 'function') {
    window.__APG_RESOLVE_MODULES();
  }
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
