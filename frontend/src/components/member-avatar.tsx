"use client";

import { useEffect, useReducer, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MEMBER_PHOTO_CACHE_EVENT,
} from "@/lib/domain/member-photo-cache";
import { resolveMemberAvatarSrc } from "@/lib/domain/member-photo";
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

type MemberAvatarProps = {
  member: Member;
  className?: string;
  imgClassName?: string;
  textClassName?: string;
};

/** Prod-style avatar: signed URL cache → inline photo → initials. */
export function MemberAvatar({
  member,
  className,
  imgClassName,
  textClassName,
}: MemberAvatarProps) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const onCache = () => tick();
    window.addEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
    return () => window.removeEventListener(MEMBER_PHOTO_CACHE_EVENT, onCache);
  }, []);

  const src = resolveMemberAvatarSrc(member);

  useEffect(() => {
    setImgFailed(false);
  }, [src, member.memberId, member.photoVersion]);

  if (src && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={member.name || member.memberId || ""}
        className={cn("rounded-full object-cover", imgClassName || className)}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700 dark:bg-muted dark:text-muted-foreground",
        textClassName || className,
      )}
    >
      {initials(member.name)}
    </span>
  );
}
