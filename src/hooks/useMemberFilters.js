import React from 'react';
import { applyAdvancedMemberFilters, groupMembersByStatus, paginate } from '../features/members/selectors.js';

export function useMemberFilters(members) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [planFilter, setPlanFilter] = React.useState('');
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(
    () => applyAdvancedMemberFilters(members, { status: statusFilter, plan: planFilter }),
    [members, statusFilter, planFilter]
  );

  const searched = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((m) => `${m.name || ''} ${m.memberId || ''} ${m.mobile || ''} ${m.email || ''}`.toLowerCase().includes(q));
  }, [filtered, query]);

  const grouped = React.useMemo(() => groupMembersByStatus(searched), [searched]);
  const paged = React.useMemo(() => paginate(searched, page, 10), [searched, page]);

  return {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    planFilter,
    setPlanFilter,
    page,
    setPage,
    grouped,
    paged
  };
}
