const React = window.React;

/**
 * Owner / branch-admin notification row for a pending password reset request.
 * Outer container is a div (not a button) so nested action buttons receive clicks reliably.
 */
export default function PasswordResetNotificationCard({
  user,
  fmtDateTime,
  busy = false,
  onOpen,
  onApprove,
  onReject,
}) {
  const u = user || {};
  const handleApprove = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || typeof onApprove !== 'function') return;
    void onApprove(u.id);
  };
  const handleReject = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || typeof onReject !== 'function') return;
    void onReject(u.id);
  };

  return React.createElement(
    'div',
    {
      role: 'group',
      className: 'w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-left',
      'data-testid': `password-reset-notification-${u.id}`,
    },
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => { if (typeof onOpen === 'function') onOpen(u); },
        className: 'w-full text-left hover:underline focus:outline-none',
      },
      React.createElement(
        'div',
        { className: 'text-xs font-semibold text-blue-800' },
        `${u.name || u.id} requested password reset`,
      ),
      React.createElement(
        'div',
        { className: 'text-[11px] text-blue-700 mb-1' },
        `User: ${u.id} • ${typeof fmtDateTime === 'function' ? fmtDateTime(u.passwordResetRequestedAt) : (u.passwordResetRequestedAt || '—')}`,
      ),
    ),
    React.createElement(
      'div',
      { className: 'flex flex-wrap gap-1.5 mt-1' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: handleApprove,
          disabled: busy,
          className: 'rounded-full border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50',
          'data-testid': `password-reset-approve-${u.id}`,
        },
        busy ? 'Working…' : 'Approve Reset',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: handleReject,
          disabled: busy,
          className: 'rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50',
          'data-testid': `password-reset-reject-${u.id}`,
        },
        busy ? 'Working…' : 'Reject Reset',
      ),
    ),
  );
}
