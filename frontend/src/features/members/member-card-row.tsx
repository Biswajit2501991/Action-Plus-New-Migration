"use client";

import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSmsSentInfoText,
  isBillingToday,
  isNewMember,
  primaryMessageActionForMember,
  shortStatus,
} from "@/lib/domain/member-actions";
import { isPaymentByPastDue, overdueDaysForMember } from "@/lib/domain/billing";
import { paymentByDateKey } from "@/lib/domain/billing";
import { cn } from "@/lib/utils";
import type { Member } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const raw = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    return `${String(d).padStart(2, "0")}/${MONTHS[m]}/${y}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
}

function initials(name?: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function statusTone(status?: string) {
  if (status === "Active") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "Hold") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "Deactivated") return "bg-pink-50 text-pink-800 border-pink-200";
  if (status === "Cancelled") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function statusDot(status?: string) {
  if (status === "Active") return "bg-emerald-500";
  if (status === "Hold") return "bg-amber-500";
  if (status === "Deactivated") return "bg-pink-500";
  return "bg-slate-400";
}

export function MemberCardRow({
  m,
  selected,
  expanded,
  isOwner,
  canEdit,
  onToggleSelect,
  onToggleExpand,
  onEdit,
  onWhatsApp,
}: {
  m: Member;
  selected: boolean;
  expanded: boolean;
  isOwner: boolean;
  canEdit: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onWhatsApp: (
    kind: "reminder" | "monthReminder" | "welcome" | "fine" | "hold" | "deactivate" | "success",
  ) => void;
}) {
  const overdue = isPaymentByPastDue(m);
  const billingToday = isBillingToday(m) && !overdue;
  const msg = primaryMessageActionForMember(m, { isOwner });
  const statusSentText = msg.key !== "none" ? getSmsSentInfoText(m, msg.key) : "";
  const paymentBy = paymentByDateKey(m) || m.billingDate || "";

  return (
    <div className="space-y-0">
      <button
        type="button"
        onClick={onToggleExpand}
        className={cn(
          "apg-member-row-card grid w-full min-w-[980px] grid-cols-[22px_88px_minmax(140px,1.4fr)_90px_78px_78px_minmax(280px,1.8fr)] items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-left text-[10px] text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-[0_6px_20px_rgba(15,23,42,0.06)] dark:bg-card dark:text-foreground",
          overdue && "apg-member-row--fine-due font-medium",
          billingToday && "apg-member-row--billing-today font-medium",
          !overdue && !billingToday && "border-slate-200/90 dark:border-border",
        )}
      >
        <span
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-600"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </span>

        <span className="truncate font-medium tabular-nums text-slate-600 dark:text-muted-foreground">
          {m.memberId}
        </span>

        <span className="flex min-w-0 items-center gap-1.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-[9px] font-semibold text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
            {m.photo || m.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(m.photo || m.photoUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials(m.name)
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-semibold text-slate-900 dark:text-foreground">
              {m.name || "—"}
            </span>
            {isNewMember(m) ? (
              <span className="inline-flex shrink-0 items-center rounded-md bg-[#EF4444] px-1.5 py-0.5 text-[8px] font-semibold uppercase leading-none text-white">
                New
              </span>
            ) : null}
          </span>
        </span>

        <span className="truncate text-slate-700 dark:text-foreground">{m.plan || "—"}</span>
        <span className="whitespace-nowrap text-slate-700 dark:text-foreground">
          {fmtDate(m.billingDate)}
        </span>
        <span className="whitespace-nowrap text-slate-700 dark:text-foreground">
          <span className="block">{fmtDate(paymentBy)}</span>
          {overdue ? (
            <span className="block text-[9px] font-semibold text-rose-700">
              Overdue by {overdueDaysForMember(m)} day{overdueDaysForMember(m) === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>

        <span
          className="flex min-w-0 flex-nowrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              "inline-flex h-6 w-[72px] shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-[10px] font-semibold leading-none",
              statusTone(String(m.status)),
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(String(m.status)))} />
            {shortStatus(m.status || "Active")}
          </span>

          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 gap-1 border-indigo-200 bg-indigo-50/80 px-2 text-[10px] font-semibold text-indigo-500 hover:bg-indigo-100 hover:text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
              onClick={onEdit}
            >
              ✎ Action
            </Button>
          ) : null}

          {msg.key !== "none" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={msg.disabled}
              className={cn(
                "h-6 shrink-0 gap-0.5 px-2 text-[10px] font-semibold",
                msg.key === "fine" &&
                  "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
                msg.key === "welcome" &&
                  "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100",
                msg.key === "reminder" &&
                  "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100",
                msg.key === "hold" &&
                  "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100",
                msg.key === "deactivate" &&
                  "border-pink-300 bg-pink-50 text-pink-800 hover:bg-pink-100",
              )}
              onClick={() =>
                onWhatsApp(msg.key === "none" ? "reminder" : msg.key)
              }
              title={msg.reason || msg.label}
            >
              <MessageCircle className="h-3 w-3" />
              {msg.label}
            </Button>
          ) : null}

          {statusSentText ? (
            <span
              className="max-w-[210px] truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              title={statusSentText}
            >
              {statusSentText}
            </span>
          ) : null}

          <span className="ml-auto inline-flex text-slate-400" aria-hidden="true">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </span>
      </button>
    </div>
  );
}

export function MemberListHeader({
  sortIndicator,
  onSort,
}: {
  sortIndicator?: (field: string) => string;
  onSort?: (field: "memberId" | "name" | "plan" | "billingDate" | "paymentBy") => void;
}) {
  const ind = (field: string) => (sortIndicator ? sortIndicator(field) : "");
  return (
    <div className="grid min-w-[980px] grid-cols-[22px_88px_minmax(140px,1.4fr)_90px_78px_78px_minmax(280px,1.8fr)] items-center gap-1.5 rounded-xl border border-sky-100 bg-sky-50/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <span />
      <button type="button" className="text-left" onClick={() => onSort?.("memberId")}>
        ID {ind("memberId")}
      </button>
      <button type="button" className="text-left" onClick={() => onSort?.("name")}>
        Name {ind("name")}
      </button>
      <button type="button" className="text-left" onClick={() => onSort?.("plan")}>
        Plan {ind("plan")}
      </button>
      <button type="button" className="text-left" onClick={() => onSort?.("billingDate")}>
        Bill Date {ind("billingDate")}
      </button>
      <button type="button" className="text-left" onClick={() => onSort?.("paymentBy")}>
        Payment By {ind("paymentBy")}
      </button>
      <span className="normal-case tracking-normal">Status / Action / Welcome</span>
    </div>
  );
}
