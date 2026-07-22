"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

type Html5QrcodeScannerLike = {
  start: (
    cameraIdOrConfig: string | MediaTrackConstraints,
    config: { fps: number; qrbox?: number | { width: number; height: number }; aspectRatio?: number },
    onSuccess: (decoded: string) => void,
    onError?: (err: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
  isScanning?: boolean;
};

function extractApg1(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  // Prefer full APG1 payload if embedded in a longer string
  const match = text.match(/APG1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (match) return match[0];
  if (text.startsWith("APG1.")) return text;
  return null;
}

/**
 * On-page rear-camera QR scanner for member digital cards (APG1…).
 * Uses html5-qrcode; stops after a successful APG1 read.
 */
export function MemberQrCameraScanner({
  disabled,
  onScan,
}: {
  disabled?: boolean;
  onScan: (payload: string) => void;
}) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `member-qr-reader-${reactId}`;
  const scannerRef = useRef<Html5QrcodeScannerLike | null>(null);
  const handlingRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        void s.stop().catch(() => null);
        void s.clear().catch(() => null);
      }
    };
  }, []);

  async function stopCamera() {
    handlingRef.current = false;
    const s = scannerRef.current;
    scannerRef.current = null;
    setRunning(false);
    if (s) {
      try {
        await s.stop();
      } catch {
        /* already stopped */
      }
      try {
        await s.clear();
      } catch {
        /* ignore */
      }
    }
  }

  async function startCamera() {
    if (disabled || starting || running) return;
    setCamError(null);
    setStarting(true);
    handlingRef.current = false;
    try {
      await stopCamera();
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(elementId) as unknown as Html5QrcodeScannerLike;
      scannerRef.current = scanner;

      const onDecoded = (decoded: string) => {
        if (handlingRef.current) return;
        const apg1 = extractApg1(decoded);
        if (!apg1) return;
        handlingRef.current = true;
        void (async () => {
          await stopCamera();
          onScan(apg1);
        })();
      };

      // Prefer rear camera on phones/tablets
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          onDecoded,
          () => undefined,
        );
      } catch {
        // Fallback: first available camera
        const devices = await Html5Qrcode.getCameras();
        if (!devices?.length) {
          throw new Error("No camera found on this device.");
        }
        const back =
          devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];
        await scanner.start(
          back.id,
          { fps: 8, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          onDecoded,
          () => undefined,
        );
      }
      setRunning(true);
    } catch (e) {
      scannerRef.current = null;
      setRunning(false);
      const msg = e instanceof Error ? e.message : "Could not start camera";
      setCamError(
        /Permission|NotAllowed|denied/i.test(msg)
          ? "Camera permission denied. Allow camera access, or paste the APG1 code below."
          : msg,
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Camera scanner</p>
        {running ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void stopCamera()}
          >
            <CameraOff className="mr-1.5 h-3.5 w-3.5" />
            Stop camera
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={disabled || starting}
            onClick={() => void startCamera()}
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            {starting ? "Starting…" : "Start camera"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Point the tablet or phone camera at the member&apos;s digital QR Card. Check-in runs
        automatically when an APG1 code is read.
      </p>
      <div
        id={elementId}
        className={`overflow-hidden rounded-lg bg-black/90 ${running ? "min-h-[240px]" : "min-h-0"}`}
      />
      {camError ? <p className="text-sm text-red-600">{camError}</p> : null}
      {!running && !camError ? (
        <p className="text-xs text-muted-foreground">
          Uses the rear camera when available. HTTPS (or localhost) is required for camera access.
        </p>
      ) : null}
    </div>
  );
}
