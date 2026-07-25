"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOGO_PATH } from "@/lib/domain/branch-branding";

type BranchLogoProps = {
  src?: string | null;
  alt?: string;
  className?: string;
};

/** Falls back to default Action Plus mark if the branch logo fails to load. */
export function BranchLogo({ src, alt = "Gym logo", className }: BranchLogoProps) {
  const [url, setUrl] = useState(String(src || DEFAULT_LOGO_PATH).trim() || DEFAULT_LOGO_PATH);

  useEffect(() => {
    setUrl(String(src || DEFAULT_LOGO_PATH).trim() || DEFAULT_LOGO_PATH);
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={cn("object-cover", className)}
      onError={() => {
        if (url !== DEFAULT_LOGO_PATH) setUrl(DEFAULT_LOGO_PATH);
      }}
    />
  );
}
