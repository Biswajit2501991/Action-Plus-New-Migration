import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export type SortState<F extends string> = {
  field: F;
  direction: SortDirection;
};

export function useTableSort<T, F extends string>(
  rows: T[],
  tableId: string,
  defaultSort: SortState<F>,
  accessor: (row: T, field: F) => string | number,
) {
  const [sort, setSort] = useState<SortState<F>>(defaultSort);

  const toggleSort = (field: F) => {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const { field, direction } = sort;
    copy.sort((a, b) => {
      const av = accessor(a, field);
      const bv = accessor(b, field);
      if (typeof av === 'number' && typeof bv === 'number') {
        return direction === 'asc' ? av - bv : bv - av;
      }
      return direction === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sort, accessor]);

  const sortIndicator = (field: F) => {
    if (sort.field !== field) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  return { sort, toggleSort, sortedRows, sortIndicator, tableId };
}
