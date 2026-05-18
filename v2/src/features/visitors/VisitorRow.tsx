import { formatDisplayDate, localCalendarDateKey, localTodayCalendarKey } from '@/lib/dates';
import type { Visitor } from '@/features/visitors/visitors.types';

type Props = {
  visitor: Visitor;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkCalled: () => void;
  onConvert: () => void;
  marking: boolean;
  converting: boolean;
};

export function VisitorRow({
  visitor: v,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onMarkCalled,
  onConvert,
  marking,
  converting,
}: Props) {
  const todayKey = localTodayCalendarKey();
  const tentativeToday = localCalendarDateKey(v.tentativeJoiningDate) === todayKey;
  const calledToday = localCalendarDateKey(v.lastCalledAt) === todayKey;
  const canMarkCalled = v.callBackRequired || tentativeToday;

  return (
    <>
      <tr className={`border-b border-slate-200 hover:bg-slate-50 cursor-pointer ${expanded ? 'bg-blue-50/40' : ''}`} onClick={onToggle}>
        <td className="px-3 py-2 w-28 max-w-28">
          <span className="block truncate font-mono text-xs text-slate-700" title={v.id}>
            {v.id}
          </span>
        </td>
        <td className="px-3 py-2 truncate" title={v.fullName}>
          {v.fullName}
        </td>
        <td className="px-3 py-2 truncate font-mono text-xs" title={v.mobile}>
          {v.mobile}
        </td>
        <td className="px-3 py-2 truncate text-xs" title={v.email}>
          {v.email}
        </td>
        <td className="px-3 py-2">{v.gender}</td>
        <td className="px-3 py-2">{formatDisplayDate(v.addedAt)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{v.status || 'New'}</span>
            {calledToday && (
              <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Called Today
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
              Edit
            </button>
            <button type="button" onClick={onDelete} className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs text-rose-700">
              Delete
            </button>
            <button
              type="button"
              disabled={v.status === 'Converted' || converting}
              onClick={(e) => {
                e.stopPropagation();
                onConvert();
              }}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {converting ? 'Opening…' : 'Convert'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-200 bg-slate-50/70">
          <td colSpan={8} className="px-4 py-3 align-top">
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><span className="text-slate-500">DOB:</span> {formatDisplayDate(v.dob)}</div>
              <div><span className="text-slate-500">Call Back:</span> {v.callBackRequired ? 'Yes' : 'No'}</div>
              <div><span className="text-slate-500">Tentative Joining:</span> {formatDisplayDate(v.tentativeJoiningDate)}</div>
              <div><span className="text-slate-500">Last Called:</span> {formatDisplayDate(v.lastCalledAt)}</div>
              <div><span className="text-slate-500">Called By:</span> {v.lastCalledBy || '-'}</div>
              <div><span className="text-slate-500">Call Status:</span> {calledToday ? 'Called Today' : 'Pending'}</div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={!canMarkCalled || calledToday || marking}
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkCalled();
                }}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
              >
                {marking ? 'Saving…' : 'Mark as Called'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
