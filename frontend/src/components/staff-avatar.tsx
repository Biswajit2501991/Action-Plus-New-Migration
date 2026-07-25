"use client";

import { useEffect, useReducer, useState } from "react";
import { cn } from "@/lib/utils";
import { MEMBER_PHOTO_CACHE_EVENT } from "@/lib/domain/member-photo-cache";
import {
  resolveStaffAvatarSrc,
  staffInitialsFromName,
} from "@/lib/domain/staff-photo";
import type { StaffUser } from "@/types";

type StaffAvatarProps = {
  user?: StaffUser | null;
  compact?: boolean;
  className?: string;
};

/** Prod-style header avatar: signed URL cache → inline photo → initials. */
export function StaffAvatar({ user, compact = false, className }: StaffAvatarProps) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const onCache = () => tick();
    window.addEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
    return () => window.removeEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
  }, []);

  const src = resolveStaffAvatarSrc(user);

  useEffect(() => {
    setImgFailed(false);
  }, [src, user?.id, user?.photoVersion]);

  const sizeClass = compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";

  if (src && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-600",
          sizeClass,
          className,
        )}
        onError={() => setImgFailed(true)}
        data-testid="header-user-photo"
      />
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-slate-200 font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600",
        sizeClass,
        className,
      )}
      data-testid="header-user-photo-initials"
      aria-label={user?.name || "Staff"}
    >
      {staffInitialsFromName(user?.name)}
    </div>
  );
}
