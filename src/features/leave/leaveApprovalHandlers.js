import {
  mergeApprovedLeaveIntoAttendance,
  mergeLeaveRequestIntoList,
  normalizeLeaveRequestFromApi,
  patchLeaveRequestStatus,
} from './leaveApprovalSync.js';

/**
 * Centralized owner/manager leave approve & reject (notification + Leave Tracker).
 */
export function createLeaveApprovalHandlers({
  backendJson,
  getLeaveRequests,
  updateLeaveRequests,
  updateStaffAttendance,
  getActor,
  logEvent,
}) {
  async function setLeaveStatus(requestId, status, meta = {}) {
    const id = String(requestId || '').trim();
    if (!id) return { ok: false, error: 'missing-id' };

    const list = typeof getLeaveRequests === 'function' ? getLeaveRequests() : [];
    const target = (Array.isArray(list) ? list : []).find((r) => r && String(r.id) === id);
    if (!target) return { ok: false, error: 'not-found' };

    const currentStatus = String(target.status || '');
    if (currentStatus !== 'Pending') {
      if (currentStatus === status) return { ok: true, request: target, alreadyProcessed: true };
      return { ok: false, error: 'already-processed', request: target };
    }

    const actor = typeof getActor === 'function' ? getActor() : '';
    let canonical = null;
    if (typeof backendJson === 'function') {
      try {
        canonical = await patchLeaveRequestStatus(backendJson, id, status);
      } catch (err) {
        return { ok: false, error: err };
      }
    } else {
      canonical = normalizeLeaveRequestFromApi(
        { ...target, status },
        { actionBy: actor },
      );
    }

    const merged = normalizeLeaveRequestFromApi(canonical, { actionBy: actor });
    if (typeof updateLeaveRequests === 'function') {
      updateLeaveRequests((prev) => mergeLeaveRequestIntoList(prev, merged));
    }

    if (status === 'Approved' && typeof updateStaffAttendance === 'function') {
      updateStaffAttendance((prev) => mergeApprovedLeaveIntoAttendance(prev, merged, actor));
    }

    if (typeof logEvent === 'function') {
      try {
        logEvent('leave.status.updated', 'leave', id, target, merged, actor, meta.source || '');
      } catch { /* noop */ }
    }

    return { ok: true, request: merged };
  }

  return {
    approveLeaveRequest: (requestId, meta) => setLeaveStatus(requestId, 'Approved', meta),
    rejectLeaveRequest: (requestId, meta) => setLeaveStatus(requestId, 'Rejected', meta),
  };
}
