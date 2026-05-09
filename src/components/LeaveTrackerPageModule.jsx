import React from 'react';

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

export default function LeaveTrackerPageModule({ users, settings, updateSetting, currentUser, theme = 'system', focusLeaveRequestId = '', focusLeaveUserId = '', onClearFocus }) {
  const canApprove = currentUser?.id === 'owner' || currentUser?.id === 'manager';
  const leaveRequests = settings?.leaveRequests || [];
  const [form, setForm] = React.useState({
    userId: currentUser?.id || '',
    type: 'Casual',
    startDate: iso(new Date()),
    endDate: iso(new Date()),
    reason: '',
  });
  const [formError, setFormError] = React.useState('');
  const [formSuccess, setFormSuccess] = React.useState('');
  const [historyUserFilter, setHistoryUserFilter] = React.useState('');
  const staff = (users || []).filter((u) => !u.blocked);
  const filteredLeaveRequests = React.useMemo(() => {
    if (focusLeaveRequestId) return leaveRequests.filter((r) => r.id === focusLeaveRequestId);
    if (focusLeaveUserId) return leaveRequests.filter((r) => r.userId === focusLeaveUserId);
    return leaveRequests;
  }, [leaveRequests, focusLeaveRequestId, focusLeaveUserId]);

  React.useEffect(() => {
    if (!form.userId && currentUser?.id) setForm((v) => ({ ...v, userId: currentUser.id }));
  }, [currentUser, form.userId]);

  const daysBetween = (a, b) => {
    const start = new Date(a);
    const end = new Date(b);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
    return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  };

  const submitLeave = () => {
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
    const req = {
      id: crypto.randomUUID(),
      ...form,
      days: daysBetween(form.startDate, form.endDate),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || currentUser?.id || '',
    };
    updateSetting('leaveRequests', [req, ...leaveRequests]);
    setForm((v) => ({ ...v, reason: '' }));
    setFormSuccess('Leave request submitted.');
    setTimeout(() => setFormSuccess(''), 2000);
  };

  const updateStatus = (id, status) => {
    if (!canApprove) return;
    updateSetting(
      'leaveRequests',
      leaveRequests.map((r) => (r.id === id
        ? { ...r, status, actionAt: new Date().toISOString(), actionBy: currentUser?.name || currentUser?.id || '' }
        : r)),
    );
  };

  const balanceFor = (userId) => {
    const year = new Date().getFullYear();
    const used = leaveRequests
      .filter((r) => r.userId === userId && r.status === 'Approved' && new Date(r.startDate).getFullYear() === year)
      .reduce((sum, r) => sum + Number(r.days || 0), 0);
    return Math.max(0, 24 - used);
  };
  const leaveHistoryRows = React.useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    return leaveRequests
      .filter((r) => r.status === 'Approved')
      .filter((r) => {
        const start = new Date(r.startDate);
        return !Number.isNaN(start.getTime()) && start >= cutoff;
      })
      .filter((r) => (historyUserFilter ? r.userId === historyUserFilter : true))
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [leaveRequests, historyUserFilter]);
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
      <div className={cardClass}>
        <h3 className={`text-base font-semibold ${pageTextClass}`}>Create Leave Request</h3>
        {formError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</div>}
        {formSuccess && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{formSuccess}</div>}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Staff</label><select value={form.userId} onChange={(e) => setForm((v) => ({ ...v, userId: e.target.value }))} className={`mt-1 w-full ${controlClass}`}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Type</label><select value={form.type} onChange={(e) => setForm((v) => ({ ...v, type: e.target.value }))} className={`mt-1 w-full ${controlClass}`}><option>Casual</option><option>Sick</option><option>Emergency</option><option>Unpaid</option></select></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Start</label><input type="date" value={form.startDate} onFocus={openNativeDatePicker} onClick={openNativeDatePicker} onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))} className={`mt-1 w-full ${controlClass}`} /></div>
          <div><label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>End</label><input type="date" value={form.endDate} onFocus={openNativeDatePicker} onClick={openNativeDatePicker} onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))} className={`mt-1 w-full ${controlClass}`} /></div>
          <div className="md:self-end"><button onClick={submitLeave} className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Submit</button></div>
          <div className="md:col-span-5"><input value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} placeholder="Reason for leave request" className={`w-full ${controlClass} ${isDarkMode ? 'placeholder:text-slate-400' : 'placeholder:text-slate-400'}`} /></div>
        </div>
      </div>
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
          const staffName = staff.find((s) => s.id === r.userId)?.name || r.userId;
          return (
            <div key={r.id} className={`rounded-2xl border p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
              <div className="text-sm">
                <div className={`font-semibold ${pageTextClass}`}>{staffName} • {r.type}</div>
                <div className={mutedTextClass}>{fmt(r.startDate)} - {fmt(r.endDate)} ({r.days} day{Number(r.days) > 1 ? 's' : ''})</div>
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
      <div className={cardClass}>
        <h3 className={`text-base font-semibold mb-2 ${pageTextClass}`}>Annual Leave Balance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {staff.map((s) => (
            <div key={s.id} className={`rounded-xl border px-3 py-2 text-sm flex items-center justify-between ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
              <span>{s.name}</span>
              <span className="font-semibold">{balanceFor(s.id)} days</span>
            </div>
          ))}
        </div>
      </div>
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className={`text-base font-semibold ${pageTextClass}`}>Leave History (Last 2 Years)</h3>
          <div className="flex items-center gap-2">
            <label className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Staff</label>
            <select value={historyUserFilter} onChange={(e) => setHistoryUserFilter(e.target.value)} className={`rounded-xl border px-2.5 py-1.5 text-xs ${isDarkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>
              <option value="">All staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
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
                  <td className="px-2 py-2">{staff.find((s) => s.id === r.userId)?.name || r.userId}</td>
                  <td className="px-2 py-2">{r.type}</td>
                  <td className="px-2 py-2">{fmt(r.startDate)} - {fmt(r.endDate)}</td>
                  <td className="px-2 py-2">{r.days}</td>
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
    </div>
  );
}
