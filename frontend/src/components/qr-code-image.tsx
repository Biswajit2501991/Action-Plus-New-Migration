"use client";

import { useEffect, useState } from "react";
import { qrDataUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";

export function QrCodeImage({
  data,
  size = 160,
  alt,
  className,
}: {
  data: string;
  size?: number;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    const payload = String(data || "").trim();
    if (!payload) {
      setSrc("");
      return;
    }
    void qrDataUrl(payload, size)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [data, size]);

  if (!src) {
    return (
      <div
        className={cn("flex items-center justify-center bg-white text-xs text-slate-400", className)}
        aria-hidden
      >
        Preparing QR…
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} />;
}

export function useQrDataUrl(data: string, size = 280) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    const payload = String(data || "").trim();
    if (!payload) {
      setSrc("");
      return;
    }
    void qrDataUrl(payload, size)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [data, size]);
  return src;
}
