type Props<F extends string> = {
  label: string;
  field: F;
  indicator: string;
  onSort: (field: F) => void;
  className?: string;
};

export function SortHeader<F extends string>({ label, field, indicator, onSort, className }: Props<F>) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`text-left font-semibold hover:text-blue-900 ${className || ''}`}
    >
      {label} <span className="text-[11px]">{indicator}</span>
    </button>
  );
}
