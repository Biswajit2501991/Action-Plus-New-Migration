"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { useMemberPhotoHydration } from "@/hooks/use-member-photo-hydration";
import { cn } from "@/lib/utils";
import type { Member } from "@/types";

export function PtClientPicker({
  members,
  selectedId,
  onSelect,
}: {
  members: Member[];
  selectedId: string;
  onSelect: (memberId: string) => void;
}) {
  useMemberPhotoHydration(members, {
    priorityIds: selectedId ? [selectedId] : members.slice(0, 20).map((m) => m.memberId),
  });

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = members.find((m) => m.memberId === selectedId) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = `${m.name || ""} ${m.plan || ""} ${m.memberId || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, search]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full md:w-80">
      <label className="text-xs text-muted-foreground">Select PT Client</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm"
      >
        <span className="min-w-0 truncate">
          {selected ? `${selected.name} - ${selected.plan}` : "Select PT Client"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-border bg-background shadow-xl">
          <div className="border-b border-border p-2">
            <div className="relative">
              <InputIcon
                value={search}
                onChange={setSearch}
                placeholder="Search clients..."
              />
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            {filtered.map((m) => {
              const active = m.memberId === selectedId;
              return (
                <button
                  key={m.memberId}
                  type="button"
                  onClick={() => {
                    onSelect(m.memberId);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left hover:bg-accent",
                    active && "bg-sky-50 dark:bg-sky-950/30",
                  )}
                >
                  <MemberAvatar
                    member={m}
                    className="h-10 w-10 shrink-0"
                    imgClassName="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                    textClassName="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.plan || "No plan"}</div>
                  </div>
                  {active ? <Check className="h-4 w-4 shrink-0 text-sky-600" /> : null}
                </button>
              );
            })}
            {!filtered.length ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">No matching PT clients.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InputIcon({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-input bg-background py-2 pl-3 pr-9 text-sm"
      />
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </>
  );
}
