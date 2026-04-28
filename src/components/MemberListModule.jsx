import React from 'react';
import MemberActionsModule from './MemberActionsModule.jsx';

export default function MemberListModule({
  query,
  statusFilter,
  planFilter,
  onQueryChange,
  onStatusFilterChange,
  onPlanFilterChange,
  grouped,
  paged,
  onPrevPage,
  onNextPage,
  onEdit,
  onCompose
}) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h2>Members (selectors + pagination)</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input placeholder="Search" value={query} onChange={(e) => onQueryChange(e.target.value)} />
        <input placeholder="Status" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} />
        <input placeholder="Plan" value={planFilter} onChange={(e) => onPlanFilterChange(e.target.value)} />
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        Active: {grouped.Active.length} | Hold: {grouped.Hold.length} | Deactivated: {grouped.Deactivated.length} | Cancelled: {grouped.Cancelled.length}
      </div>
      <table width="100%" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr><th align="left">ID</th><th align="left">Name</th><th align="left">Email</th><th align="left">Mobile</th><th align="left">Actions</th></tr>
        </thead>
        <tbody>
          {paged.rows.map((m) => (
            <tr key={m.memberId} style={{ borderTop: '1px solid #eee' }}>
              <td>{m.memberId}</td>
              <td>{m.name || '-'}</td>
              <td>{m.email || '-'}</td>
              <td>{m.mobile || '-'}</td>
              <td>
                <MemberActionsModule memberId={m.memberId} onEdit={onEdit} onCompose={onCompose} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <button onClick={onPrevPage}>Prev</button>{' '}
        <span>Page {paged.page} / {paged.totalPages}</span>{' '}
        <button onClick={onNextPage}>Next</button>{' '}
      </div>
    </section>
  );
}
