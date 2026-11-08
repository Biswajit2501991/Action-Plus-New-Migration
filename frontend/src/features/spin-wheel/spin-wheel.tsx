"use client";

export type SpinSlice = {
  label: string;
  discount: number;
};

const SLICE_COLORS = ["#6d28d9", "#d97706", "#db2777", "#0f766e", "#ea580c", "#4f46e5", "#ca8a04", "#0891b2"];

export function rotationForSegment(index: number, count: number, turns = 5) {
  const slice = 360 / Math.max(count, 1);
  return turns * 360 - (index + 0.5) * slice;
}

export function SpinWheel({
  segments,
  rotation,
  spinning,
  buttonLabel,
  disabled,
  onSpin,
}: {
  segments: SpinSlice[];
  rotation: number;
  spinning: boolean;
  buttonLabel: string;
  disabled?: boolean;
  onSpin: () => void;
}) {
  const slice = 360 / Math.max(segments.length, 1);
  const gradient = segments
    .map((segment, index) => {
      const color = SLICE_COLORS[index % SLICE_COLORS.length];
      return `${color} ${index * slice}deg ${(index + 1) * slice}deg`;
    })
    .join(", ");

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      <div className="absolute left-1/2 top-1 z-20 -translate-x-1/2" aria-hidden>
        <div className="h-0 w-0 border-x-[11px] border-x-transparent border-t-[18px] border-t-[#eab308] drop-shadow" />
      </div>
      <div
        className="absolute inset-3 rounded-full shadow-[0_0_0_8px_#eab308,0_16px_40px_rgba(0,0,0,0.28)]"
        style={{
          background: `conic-gradient(from 0deg, ${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 5.2s cubic-bezier(0.12, 0.72, 0.08, 1)" : "none",
        }}
      >
        {segments.map((segment, index) => {
          const angle = (index + 0.5) * slice;
          return (
            <span
              key={`${segment.label}-${index}`}
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{ transform: `rotate(${angle}deg) translateY(-108px)` }}
            >
              <span
                className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-sm font-extrabold text-white"
                style={{
                  transform: `rotate(${-angle}deg)`,
                  textShadow: "0 1px 2px rgba(0,0,0,0.65)",
                }}
              >
                {segment.label}
              </span>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSpin}
        disabled={disabled}
        className="absolute left-1/2 top-1/2 z-10 grid h-[4.6rem] w-[4.6rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#eab308] bg-[#111827] text-xs font-extrabold tracking-[0.14em] text-white disabled:cursor-default disabled:opacity-70"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
