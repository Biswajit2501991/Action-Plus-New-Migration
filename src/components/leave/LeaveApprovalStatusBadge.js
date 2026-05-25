import React from 'react';

const STYLES = {
  Approved: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Rejected: 'border-rose-300 bg-rose-50 text-rose-700',
  Pending: 'border-amber-300 bg-amber-50 text-amber-700',
};

export default function LeaveApprovalStatusBadge({ status = 'Pending', className = '' }) {
  const key = STYLES[status] ? status : 'Pending';
  return React.createElement(
    'span',
    { className: `rounded-full px-2.5 py-1 text-xs font-semibold border ${STYLES[key]} ${className}`.trim() },
    status,
  );
}
