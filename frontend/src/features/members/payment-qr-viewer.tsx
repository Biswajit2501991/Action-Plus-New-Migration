"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, QrCode, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { paymentQrApi, type PaymentQrItem } from "@/services/api";
import { useGymCodes } from "@/hooks/use-data";
import { useAuthStore } from "@/stores";
import { hasAccess } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

function sortActiveItems(items: PaymentQrItem[] = []) {
  return [...items]
    .filter((item) => item && item.isActive !== false)
    .sort((a, b) => {
      const orderA = Number(a?.displayOrder || 0);
      const orderB = Number(b?.displayOrder || 0);
      if (orderA !== orderB) return orderA - orderB;
      return String(a?.qrName || "").localeCompare(String(b?.qrName || ""));
    });
}

export function canViewPaymentQr(user: ReturnType<typeof useAuthStore.getState>["user"]) {
  if (!user) return false;
  if (String(user.id || "").toLowerCase() === "owner") return true;
  if (String(user.staffRole || "").toLowerCase() === "master_owner") return true;
  return hasAccess(user, "paymentQr", "viewPaymentQr");
}

export function PaymentQrButton({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  if (!canViewPaymentQr(user)) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("apg-payment-qr-btn-flash h-8 gap-1 px-3 text-xs font-semibold", className)}
        onClick={() => setOpen(true)}
        data-testid="members-payment-qr-button"
      >
        <QrCode className="h-3 w-3" />
        Payment QR
      </Button>
      {open ? <PaymentQrViewerModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PaymentQrViewerModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { data: gymCodes = [] } = useGymCodes();
  const isOwner =
    String(user?.id || "").toLowerCase() === "owner" ||
    String(user?.staffRole || "").toLowerCase() === "master_owner";

  const defaultBranch = String(user?.activeBranchId || user?.gymCodeId || gymCodes[0]?.id || "").trim();
  const [branchId, setBranchId] = useState(defaultBranch);
  const [items, setItems] = useState<PaymentQrItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomOpen) setZoomOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImgFailed(false);
    setZoomOpen(false);
    void paymentQrApi
      .list({ gymCodeId: branchId || undefined, activeOnly: true })
      .then((res) => {
        if (cancelled) return;
        const next = sortActiveItems(Array.isArray(res?.items) ? res.items : []);
        setItems(next);
        setIndex(0);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setItems([]);
        toast.error(e?.message || "Could not load payment QR codes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const active = useMemo(() => items[Math.min(Math.max(0, index), Math.max(0, items.length - 1))] || null, [items, index]);
  const src = String(active?.qrImageUrl || "").trim();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-qr-viewer-title"
      onClick={zoomOpen ? undefined : onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h4 id="payment-qr-viewer-title" className="text-lg font-semibold">
            Payment QR
          </h4>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col items-center gap-3 px-5 py-5 text-center">
          {isOwner && gymCodes.length > 0 ? (
            <label className="w-full text-left text-xs font-semibold text-muted-foreground">
              Gym Branch
              <Select
                className="mt-1"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {gymCodes.map((gc) => (
                  <option key={gc.id} value={gc.id}>
                    {gc.name || gc.label || gc.code || gc.id}
                    {gc.code ? ` (${gc.code})` : ""}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          {loading ? (
            <div className="py-10 text-sm text-muted-foreground">Loading payment QR codes…</div>
          ) : !active ? (
            <div className="py-10 text-sm text-muted-foreground">
              No active payment QR codes for this branch.
            </div>
          ) : (
            <>
              <div>
                <div className="text-lg font-semibold">{active.qrName || "Payment QR"}</div>
                <div className="mt-1 text-sm text-muted-foreground">{active.branchLabel || ""}</div>
              </div>
              {src && !imgFailed ? (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="cursor-zoom-in rounded-2xl border border-border bg-card p-1 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  aria-label="Enlarge QR code for scanning"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={String(active.qrName || "QR")}
                    className="pointer-events-none h-56 w-56 rounded-xl object-contain"
                    onError={() => setImgFailed(true)}
                  />
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ZoomIn className="h-3 w-3" /> Tap to enlarge
                  </span>
                </button>
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
                  QR image unavailable
                </div>
              )}

              {items.length > 1 ? (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index <= 0}
                    onClick={() => setIndex((v) => Math.max(0, v - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </Button>
                  <span className="text-sm font-semibold">
                    {index + 1} / {items.length}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index >= items.length - 1}
                    onClick={() => setIndex((v) => Math.min(items.length - 1, v + 1))}
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {zoomOpen && src ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="rounded-3xl bg-background p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Payment QR enlarged" className="max-h-[80vh] max-w-[90vw] object-contain" />
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
