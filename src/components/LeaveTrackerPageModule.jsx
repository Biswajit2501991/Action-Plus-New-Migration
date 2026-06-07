import React from 'react';
import { leaveSubmitErrorMessage } from '../features/leave/leaveSubmitError.js';
import {
  annualLeaveBalanceRemaining,
  leaveDaysBetween,
  leaveUserIdsMatch,
  mergeLeaveRequestIntoList,
  normalizeLeaveRequestFromApi,
  patchLeaveRequestStatus,
  mergeApprovedLeaveIntoAttendance,
} from '../features/leave/leaveApprovalSync.js';

function iso(val) {
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fmt(val) {
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeAccessInline(access) {
  const fn = typeof window !== 'undefined' ? window.__APG_MODULES?.normalizeAccess : null;
  if (typeof fn === 'function') return fn(access);
  return access && typeof access === 'object' ? access : {};
}

export default function LeaveTrackerPageModule({
  users,
  settings,
  updateSetting,
  currentUser,
  access = {},
  theme = 'system',
  focusLeaveRequestId = '',
  focusLeaveUserId = '',
  onClearFocus,
}) {
  const leaveAccess = normalizeAccessInline(access).leave || {};
  const canViewCreateLeaveRequest = leaveAccess.viewCreateLeaveRequest !== false;
  const canViewLeaveRequests = leaveAccess.viewLeaveRequests !== false;
  const canViewAnnualLeaveBalance = leaveAccess.viewAnnualLeaveBalance !== false;
  const canViewLeaveHistory = leaveAccess.viewLeaveHistory !== false;
  const canApprove = (currentUser?.id === 'owner' || currentUser?.id === 'manager') && canViewLeaveRequests;
  const isOwnerView = currentUser?.id === 'owner' || currentUser?.id === 'manager';
  const leaveRequests = React.useMemo(
    () => (Array.isArray(settings?.leaveRequests) ? settings.leaveRequests : []).map((r) => normalizeLeaveRequestFromApi(r)),
    [settings?.leaveRequests],
  );
  const [form, setForm] = React.useState({
    userId: currentUser?.id || '',
    type: 'Casual',
    startDate: iso(new Date()),
    endDate: iso(new Date()),
    reason: '',
  });
  const [formError, setFormError] = React.useState('');
  const [formSuccess, setFormSuccess] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [historyUserFilter, setHistoryUserFilter] = React.useState('');
  const staff = (users || []).filter((u) => !u.blocked);
  const filteredLeaveRequests = React.useMemo(() => {
    if (focusLeaveRequestId) return leaveRequests.filter((r) => r.id === focusLeaveRequestId);
    if (focusLeaveUserId) return leaveRequests.filter((r) => leaveUserIdsMatch(r.userId, focusLeaveUserId));
    return leaveRequests;
  }, [leaveRequests, focusLeaveRequestId, focusLeaveUserId]);

  React.useEffect(() => {
    if (!form.userId && currentUser?.id) setForm((v) => ({ ...v, userId: currentUser.id }));
  }, [currentUser, form.userId]);

  const submitLeave = async () => {
    if (submitting) return;
    setFormError('');
    setFormSuccess('');
    if (!form.userId || !form.startDate || !form.endDate) {
      setFormError('Please select staff, start date, and end date.');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError('End date cannot be before start date.');
      return;
    }
    setSubmitting(true);
    const days = leaveDaysBetween(form.startDate, form.endDate);
    const callerName = currentUser?.name || currentUser?.id || '';
    const backendJsonFn = typeof window !== 'undefined' ? window.__APG_BACKEND_JSON__ : null;
    let req = null;
    if (typeof backendJsonFn === 'function') {
      try {
        const resp = await backendJsonFn('/leave-requests', {
          method: 'POST',
          body: JSON.stringify({
            userId: form.userId,
            type: form.type,
            startDate: form.startDate,
            endDate: form.endDate,
            reason: form.reason,
          }),
        });
        req = resp && resp.request ? normalizeLeaveRequestFromApi(resp.request) : null;
      } catch (err) {
        setSubmitting(false);
        setFormError(leaveSubmitErrorMessage(err));
        return;
      }
    }
    if (!req) {
      req = normalizeLeaveRequestFromApi({
        id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `leave-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        ...form,
        days,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        createdBy: callerName,
      });
    }
    if (typeof updateSetting === 'function') {
      updateSetting('leaveRequests', (prev) => {
        const base = Array.isArray(prev) ? prev : leaveRequests || [];
        if (base.some((r) => r && r.id === req.id)) return base;
        return [req, ...base];
      });
    }
    setForm((v) => ({ ...v, reason: '' }));
    setSubmitting(false);
    setFormSuccess('✓ Leave request saved successfully');
    setTimeout(() => setFormSuccess(''), 3000);
  };

  const updateStatus = async (id, status) => {
    if (!canApprove || typeof updateSetting !== 'function') return;
    const target = (leaveRequests || []).find((r) => r && r.id === id);
    if (!target || target.status !== 'Pending') return;
    const actor = currentUser?.name || currentUser?.id || '';
    const backendJsonFn = typeof window !== 'undefined' ? window.__APG_BACKEND_JSON__ : null;
    let canonical = null;
    if (typeof backendJsonFn === 'function') {
      try {
        canonical = await patchLeaveRequestStatus(backendJsonFn, id, status);
      } catch {
        return;
      }
    } else {
      canonical = normalizeLeaveRequestFromApi({ ...target, status }, { actionBy: actor });
    }
    const merged = normalizeLeaveRequestFromApi(canonical, { actionBy: actor });
    updateSetting('leaveRequests', (prev) => mergeLeaveRequestIntoList(prev, merged));
    if (status === 'Approved') {
      updateSetting('staffAttendance', (prev) => mergeApprovedLeaveIntoAttendance(prev, merged, actor));
    }
  };

  const balanceFor = (userId) => annualLeaveBalanceRemaining(leaveRequests, userId);
  const leaveHistoryRows = React.useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    return leaveRequests
      .filter((r) => r.status === 'Approved')
      .filter((r) => {
        const start = new Date(r.startDate);
        return !Number.isNaN(start.getTime()) && start >= cutoff;
      })
      .filter((r) => (historyUserFilter ? leaveUserIdsMatch(r.userId, historyUserFilter) : true))
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [leaveRequests, historyUserFilter]);
  const balanceStaff = isOwnerView
    ? staff
    : staff.filter((s) => leaveUserIdsMatch(s.id, currentUser?.id));
  const isDarkMode = theme === 'dark';
  const openNativeDatePicker = (e) => {
    e.stopPropagation();
    if (typeof e.target?.showPicker === 'function') e.target.showPicker();
  };
  const pageTextClass = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const mutedTextClass = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const cardClass = isDarkMode
    ? 'rounded-3xl border border-slate-700 bg-slate-900/85 p-4 space-y-3'
    : 'rounded-3xl border border-slate-200 bg-white p-4 space-y-3';
  const controlClass = isDarkMode
    ? 'rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100'
    : 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';

  return (
    <div className={`p-3 md:p-8 space-y-4 ${pageTextClass} ${isDarkMode ? 'bg-slate-950' : 'bg-slate-100 apg-force-light'}`}>
      <div>
        <h1 className={`text-xl md:text-2xl font-semibold ${pageTextClass}`}>Leave Tracker</h1>
        <p className={`text-sm ${mutedTextClass}`}>Leave requests, approvals, and yearly balance tracking.</p>
      </div>
      {canViewCreateLeaveRequest && (
      <div className={cardClass}>
        <h3 className={`text-base font-semibold ${pageTextClass}`}>Create Leave Request</h3>
        {formError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</div>}
        {formSuccess && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{formSuccess}</div>}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Staff</label><select value={form.userId} onChange={(e) => setForm((v) => ({ ...v, userId: e.target.value }))} className={`mt-1 w-full ${controlClass}`}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Type</label><select value={form.type} onChange={(e) => setForm((v) => ({ ...v, type: e.target.value }))} className={`mt-1 w-full ${controlClass}`}><option>Casual</option><option>Sick</option><option>Emergency</option><option>Unpaid</option></select></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Start</label><input type="date" value={form.startDate} onFocus={openNativeDatePicker} onClick={openNativeDatePicker} onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))} className={`mt-1 w-full ${controlClass}`} /></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>End</label><input type="date" value={form.endDate} onFocus={openNativeDatePicker} onClick={openNativeDatePicker} onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))} className={`mt-1 w-full ${controlClass}`} /></div>
          <div className="md:self-end"><button type="button" disabled={submitting} onClick={submitLeave} className={`w-full rounded-full px-4 py-2 text-sm font-medium text-white ${submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{submitting ? 'Saving...' : 'Submit'}</button></div>
          <div className="md:col-span-5"><input value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} placeholder="Reason for leave request" className={`w-full ${controlClass} ${isDarkMode ? 'placeholder:text-slate-400' : 'placeholder:text-slate-400'}`} /></div>
        </div>
      </div>
      )}
      {canViewLeaveRequests && (
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-base font-semibold ${pageTextClass}`}>Leave Requests</h3>
          {(focusLeaveRequestId || focusLeaveUserId) && (
            <button onClick={() => onClearFocus && onClearFocus()} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isDarkMode ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>
              Clear Filter
            </button>
          )}
        </div>
        {(filteredLeaveRequests || []).map((r) => {
          const staffName = staff.find((s) => leaveUserIdsMatch(s.id, r.userId))?.name || r.userId;
          const dayCount = Number(r.days || leaveDaysBetween(r.startDate, r.endDate));
          return (
            <div key={r.id} className={`rounded-2xl border p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
              <div className="text-sm">
                <div className={`font-semibold ${pageTextClass}`}>{staffName} • {r.type}</div>
                <div className={mutedTextClass}>{fmt(r.startDate)} - {fmt(r.endDate)} ({dayCount} day{dayCount > 1 ? 's' : ''})</div>
                <div className={mutedTextClass}>{r.reason}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
                  r.status === 'Approved' ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : r.status === 'Rejected' ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-amber-300 bg-amber-50 text-amber-700'
                }`}>{r.status}</span>
                {canApprove && r.status === 'Pending' && (
                  <>
                    <button onClick={() => updateStatus(r.id, 'Approved')} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Approve</button>
                    <button onClick={() => updateStatus(r.id, 'Rejected')} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">Reject</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {(!filteredLeaveRequests || filteredLeaveRequests.length === 0) && <div className={`text-sm ${mutedTextClass}`}>No leave requests found for selected filter.</div>}
      </div>
      )}
      {canViewAnnualLeaveBalance && (
      <div className={cardClass}>
        <h3 className={`text-base font-semibold mb-2 ${pageTextClass}`}>Annual Leave Balance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {balanceStaff.map((s) => (
            <div key={s.id} className={`rounded-xl border px-3 py-2 text-sm flex items-center justify-between ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
              <span>{s.name}</span>
              <span className="font-semibold">{balanceFor(s.id)} days</span>
            </div>
          ))}
        </div>
      </div>
      )}
      {canViewLeaveHistory && (
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className={`text-base font-semibold ${pageTextClass}`}>Leave History (Last 2 Years)</h3>
          {isOwnerView && (
          <div className="flex items-center gap-2">
            <label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Staff</label>
            <select value={historyUserFilter} onChange={(e) => setHistoryUserFilter(e.target.value)} className={`rounded-xl border px-2.5 py-1.5 text-xs ${isDarkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>
              <option value="">All staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-600'}>
                <th className="px-2 py-2 text-left">Staff</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Duration</th>
                <th className="px-2 py-2 text-left">Days</th>
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveHistoryRows.map((r) => (
                <tr key={`hist-${r.id}`} className={isDarkMode ? 'border-t border-slate-700' : 'border-t border-slate-100'}>
                  <td className="px-2 py-2">{staff.find((s) => leaveUserIdsMatch(s.id, r.userId))?.name || r.userId}</td>
                  <td className="px-2 py-2">{r.type}</td>
                  <td className="px-2 py-2">{fmt(r.startDate)} - {fmt(r.endDate)}</td>
                  <td className="px-2 py-2">{Number(r.days || leaveDaysBetween(r.startDate, r.endDate))}</td>
                  <td className="px-2 py-2">
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Approved</span>
                  </td>
                </tr>
              ))}
              {leaveHistoryRows.length === 0 && (
                <tr>
                  <td colSpan={5} className={`px-2 py-3 text-center ${mutedTextClass}`}>No approved leave found in the last 2 years for selected filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
