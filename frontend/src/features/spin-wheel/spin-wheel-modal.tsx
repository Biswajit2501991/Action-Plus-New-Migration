"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { SpinResult } from "@/features/spin-wheel/spin-result";
import { rotationForSegment, SpinWheel, type SpinSlice } from "@/features/spin-wheel/spin-wheel";

export type SpinPrize = {
  segmentIndex: number;
  discount: number;
  couponCode: string | null;
  expiresAt: string | null;
  alreadyUsed?: boolean;
};

export function SpinWheelModal({
  open,
  title,
  subtitle,
  buttonLabel,
  segments,
  closeOverlay,
  preview,
  onClose,
  onSpin,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  buttonLabel: string;
  segments: SpinSlice[];
  closeOverlay: boolean;
  preview?: boolean;
  onClose: () => void;
  onSpin?: () => Promise<SpinPrize>;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<SpinPrize | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const spinGen = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    spinGen.current += 1;
    busyRef.current = false;
    setRotation(0);
    setSpinning(false);
    setPrize(null);
    setError("");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function spin() {
    if (busyRef.current || prize) return;
    busyRef.current = true;
    setError("");
    const gen = spinGen.current;
    const finish = (next: SpinPrize) => {
      const turns = reduced ? 0 : 5;
      const target = rotationForSegment(next.segmentIndex, segments.length, turns);
      if (reduced) {
        setRotation(target);
        setPrize(next);
        return;
      }
      setSpinning(true);
      window.setTimeout(() => {
        if (gen !== spinGen.current) return;
        setRotation(target);
      }, 40);
      window.setTimeout(() => {
        if (gen !== spinGen.current) return;
        setSpinning(false);
        setPrize(next);
      }, 5340);
    };
    if (preview) {
      const index = Math.min(1, Math.max(segments.length - 1, 0));
      finish({
        segmentIndex: index,
        discount: segments[index]?.discount || 0,
        couponCode: null,
        expiresAt: null,
      });
      return;
    }
    if (!onSpin) {
      busyRef.current = false;
      return;
    }
    try {
      finish(await onSpin());
    } catch {
      busyRef.current = false;
      setSpinning(false);
      setError("The wheel could not finish. Nothing was saved. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Close spin offer"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (closeOverlay && !spinning) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spin-wheel-title"
        className="relative z-10 max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-200 bg-card p-5 shadow-2xl dark:border-amber-500/30"
      >
        <button
          type="button"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-border"
          onClick={onClose}
          disabled={spinning}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <p id="spin-wheel-title" className="pr-10 text-2xl font-semibold">
          {title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-4">
          <SpinWheel
            segments={segments}
            rotation={rotation}
            spinning={spinning}
            buttonLabel={buttonLabel || "SPIN"}
            disabled={spinning || Boolean(prize)}
            onSpin={() => {
              void spin();
            }}
          />
        </div>
        {error ? <p className="mt-3 text-center text-sm text-rose-600">{error}</p> : null}
        {prize ? (
          <div className="mt-3">
            <SpinResult
              discount={prize.discount}
              couponCode={prize.couponCode}
              expiresAt={prize.expiresAt}
              preview={preview}
              alreadyUsed={prize.alreadyUsed}
            />
          </div>
        ) : null}
        {Array.from({ length: prize && !preview && !reduced ? 18 : 0 }).map((_, index) => (
          <span
            key={index}
            className="pointer-events-none absolute h-2 w-2 rounded-full"
            style={{
              left: `${8 + ((index * 17) % 84)}%`,
              top: `${12 + ((index * 13) % 30)}%`,
              background: index % 2 ? "#eab308" : "#7c3aed",
              animation: `spin-confetti 900ms ease-out ${index * 30}ms both`,
            }}
          />
        ))}
        <style>{`@keyframes spin-confetti { from { transform: translateY(0); opacity: 1 } to { transform: translateY(46px); opacity: 0 } }`}</style>
      </div>
    </div>
  );
}
