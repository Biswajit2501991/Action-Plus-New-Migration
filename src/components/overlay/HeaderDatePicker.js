import {
  MONTH_SHORT,
  WEEKDAY_LABELS,
  buildMonthGridCells,
  addMonths,
  formatHeaderDateButtonLabel,
  localTodayCalendarKey,
  parseCalendarDateKey,
  viewFromDateKey,
} from '../../features/overlay/headerDatePickerModel.js';

const React = window.React;
const ReactDOM = window.ReactDOM;

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function HeaderDatePickerPanel({
  value,
  viewYear,
  viewMonth,
  onPick,
  onPrevMonth,
  onNextMonth,
  onToday,
}) {
  const todayKey = localTodayCalendarKey();
  const cells = buildMonthGridCells(viewYear, viewMonth, value, todayKey);
  const monthLabel = `${MONTH_SHORT[viewMonth] || ''} ${viewYear}`;

  return React.createElement(
    'div',
    { className: 'rounded-xl border border-slate-200 bg-white shadow-xl p-3' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between gap-2 mb-2' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onPrevMonth,
          className: 'rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50',
          'aria-label': 'Previous month',
        },
        '‹',
      ),
      React.createElement(
        'div',
        { className: 'text-sm font-semibold text-slate-800', 'data-testid': 'header-date-picker-month' },
        monthLabel,
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onNextMonth,
          className: 'rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50',
          'aria-label': 'Next month',
        },
        '›',
      ),
    ),
    React.createElement(
      'div',
      { className: 'grid grid-cols-7 gap-1 mb-1' },
      WEEKDAY_LABELS.map((label) => React.createElement(
        'div',
        {
          key: label,
          className: 'text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1',
        },
        label,
      )),
    ),
    React.createElement(
      'div',
      { className: 'grid grid-cols-7 gap-1', role: 'grid', 'aria-label': 'Calendar days' },
      cells.map((cell) => React.createElement(
        'button',
        {
          key: cell.key,
          type: 'button',
          role: 'gridcell',
          'aria-selected': cell.isSelected,
          'aria-current': cell.isToday ? 'date' : undefined,
          onClick: () => onPick(cell.dateKey),
          className: cx(
            'h-8 rounded-lg text-xs font-semibold transition-colors',
            cell.isSelected
              ? 'bg-blue-600 text-white'
              : cell.isToday
                ? 'border border-blue-300 bg-blue-50 text-blue-700'
                : cell.inMonth
                  ? 'text-slate-700 hover:bg-slate-100'
                  : 'text-slate-300 hover:bg-slate-50',
          ),
          'data-testid': `header-date-day-${cell.dateKey}`,
        },
        String(cell.day),
      )),
    ),
    React.createElement(
      'div',
      { className: 'mt-2 flex justify-end' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onToday,
          className: 'rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50',
        },
        'Today',
      ),
    ),
  );
}

/**
 * Header "as-of" date control: trigger button + portaled month grid anchored like notifications.
 */
export default function HeaderDatePicker({
  value,
  onChange,
  compact = false,
  showYear = true,
  showIcon = false,
  width = 280,
  maxHeight = 360,
  offset = 8,
  align = 'end',
  testId = 'header-date-picker',
}) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const anchorRef = React.useRef(null);
  const popRef = React.useRef(null);
  const initialView = viewFromDateKey(value);
  const [viewYear, setViewYear] = React.useState(initialView.year);
  const [viewMonth, setViewMonth] = React.useState(initialView.month);

  const measureFn = window.__APG_MODULES?.measureAnchoredPopoverCoords;
  const layerClass = window.__APG_MODULES?.ANCHORED_POPOVER_LAYER_CLASS || 'apg-anchored-popover';

  React.useEffect(() => {
    const next = viewFromDateKey(value);
    setViewYear(next.year);
    setViewMonth(next.month);
  }, [value]);

  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    const next = viewFromDateKey(value);
    setViewYear(next.year);
    setViewMonth(next.month);

    function measure() {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth || document.documentElement.clientWidth || 0,
        height: window.innerHeight || document.documentElement.clientHeight || 0,
      };
      if (typeof measureFn === 'function') {
        setCoords(measureFn(rect, viewport, { width, maxHeight, offset, align }));
        return;
      }
      const padding = 12;
      const right = Math.max(padding, viewport.width - rect.right);
      setCoords({ top: rect.bottom + offset, right, width, maxHeight });
    }

    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, value, offset, width, maxHeight, align, measureFn]);

  React.useEffect(() => {
    if (!open) return undefined;

    const onDoc = (e) => {
      const target = e.target;
      if (anchorRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pickDate = (dateKey) => {
    if (typeof onChange === 'function' && parseCalendarDateKey(dateKey)) {
      onChange(dateKey);
    }
    setOpen(false);
  };

  const buttonLabel = formatHeaderDateButtonLabel(value, { showYear, showIcon });
  const buttonClass = compact
    ? 'shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50'
    : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]';

  const popover = open && coords
    ? (() => {
      const style = {
        top: coords.top,
        width: coords.width,
        maxHeight: coords.maxHeight,
      };
      if (coords.right != null) style.right = coords.right;
      if (coords.left != null) style.left = coords.left;

      const node = React.createElement(
        'div',
        {
          ref: popRef,
          className: cx('apg-header-date-popover', layerClass),
          'data-testid': `${testId}-popover`,
          role: 'dialog',
          'aria-modal': 'false',
          'aria-label': 'Select date',
          onClick: (e) => e.stopPropagation(),
          style,
        },
        React.createElement(HeaderDatePickerPanel, {
          value,
          viewYear,
          viewMonth,
          onPick: pickDate,
          onPrevMonth: () => {
            const next = addMonths(viewYear, viewMonth, -1);
            setViewYear(next.year);
            setViewMonth(next.month);
          },
          onNextMonth: () => {
            const next = addMonths(viewYear, viewMonth, 1);
            setViewYear(next.year);
            setViewMonth(next.month);
          },
          onToday: () => pickDate(localTodayCalendarKey()),
        }),
      );

      if (typeof document === 'undefined' || !document.body || !ReactDOM || typeof ReactDOM.createPortal !== 'function') {
        return node;
      }
      return ReactDOM.createPortal(node, document.body);
    })()
    : null;

  return React.createElement(
    'div',
    { className: 'relative shrink-0' },
    React.createElement(
      'button',
      {
        ref: anchorRef,
        type: 'button',
        onClick: (e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        },
        className: buttonClass,
        title: 'Select date',
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'data-testid': testId,
      },
      buttonLabel,
    ),
    popover,
  );
}
