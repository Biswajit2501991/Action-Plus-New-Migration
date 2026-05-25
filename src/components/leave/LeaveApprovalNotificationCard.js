import React from 'react';

/**
 * Owner notification row for a pending leave request.
 */
export default function LeaveApprovalNotificationCard({
  request,
  fmt,
  busy = false,
  onOpen,
  onApprove,
}) {
  const n = request || {};
  const handleApprove = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || typeof onApprove !== 'function') return;
    void onApprove(n.id);
  };

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: () => { if (typeof onOpen === 'function') onOpen(n); },
      className: 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-left hover:bg-slate-100 disabled:opacity-60',
      'data-testid': `leave-notification-${n.id}`,
    },
    React.createElement('div', { className: 'text-xs font-semibold text-slate-800' }, `${n.type} leave request`),
    React.createElement(
      'div',
      { className: 'text-[11px] text-slate-600 mb-1' },
      `${n.userId} • ${typeof fmt === 'function' ? fmt(n.startDate) : n.startDate} - ${typeof fmt === 'function' ? fmt(n.endDate) : n.endDate}`,
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: handleApprove,
        disabled: busy,
        className: 'rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50',
        'data-testid': `leave-notification-approve-${n.id}`,
      },
      busy ? 'Approving…' : 'Approve',
    ),
  );
}
