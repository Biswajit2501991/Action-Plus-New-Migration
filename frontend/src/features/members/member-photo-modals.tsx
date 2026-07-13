"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MEMBER_PHOTO_CACHE_EVENT } from "@/lib/domain/member-photo-cache";
import { resolveMemberAvatarSrc } from "@/lib/domain/member-photo";
import { formatDate } from "@/lib/utils";
import type { Member } from "@/types";

function initials(name?: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

type PreviewProps = {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  /** Optional draft photo (data URL) overriding cache/inline. */
  photoOverride?: string;
  gymLabel?: string;
};

/** Prod-style member photo pop view: large photo + name, ID, billing date. */
export function MemberPhotoPreviewModal({
  open,
  onClose,
  member,
  photoOverride,
  gymLabel = "",
}: PreviewProps) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [imgFailed, setImgFailed] = useState(false);
  useEscClose(open, onClose);

  useEffect(() => {
    const onCache = () => tick();
    window.addEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
    return () => window.removeEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
  }, []);

  const override = String(photoOverride || "").trim();
  const src = override.startsWith("data:") || override.startsWith("http")
    ? override
    : resolveMemberAvatarSrc(member);

  useEffect(() => {
    setImgFailed(false);
  }, [src, member?.memberId, member?.photoVersion, open]);

  if (!open || !member) return null;

  const displayName = String(member.name || "").trim() || "Member";
  const displayId = String(member.memberId || "").trim();
  const billing = member.billingDate ? formatDate(member.billingDate) : "";
  const gymText = String(gymLabel || "").trim();

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-photo-preview-title"
      data-testid="member-photo-preview-modal"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <h4 id="member-photo-preview-title" className="text-lg font-semibold">
            Member Photo
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-muted"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col items-center px-6 pb-2 text-center">
          {src && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={displayName}
              className="h-48 w-48 rounded-full border border-slate-200 object-cover shadow-sm sm:h-56 sm:w-56 dark:border-border"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="grid h-48 w-48 place-items-center rounded-full border border-slate-200 bg-slate-200 text-3xl font-semibold text-slate-700 sm:h-56 sm:w-56 dark:border-border dark:bg-muted">
              {initials(displayName)}
            </div>
          )}
          <p className="mt-5 text-lg font-semibold">{displayName}</p>
          {displayId ? (
            <p className="mt-1 text-sm text-muted-foreground">Member ID: {displayId}</p>
          ) : null}
          {billing ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Billing date: {billing}</p>
          ) : null}
          {gymText ? <p className="mt-0.5 text-sm text-muted-foreground">{gymText}</p> : null}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4 dark:border-border">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

type PickerProps = {
  open: boolean;
  onClose: () => void;
  onPickFile: (file: File) => void | Promise<void>;
  title?: string;
};

/** Camera vs device upload picker (prod PhotoSourcePickerModal). */
export function PhotoSourcePickerModal({
  open,
  onClose,
  onPickFile,
  title = "Member photo",
}: PickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  useEscClose(open, onClose);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    onClose();
    await onPickFile(file);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 shadow-xl dark:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Choose how you want to add the photo.</p>
        <Button
          variant="outline"
          className="h-auto w-full justify-center py-3"
          onClick={() => cameraRef.current?.click()}
        >
          Take Photo (Camera)
        </Button>
        <Button
          variant="outline"
          className="h-auto w-full justify-center py-3"
          onClick={() => uploadRef.current?.click()}
        >
          Upload from Device
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </div>
  );
}
