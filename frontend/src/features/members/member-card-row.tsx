"use client";

import { ChevronDown, ChevronUp, Cake, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/member-avatar";
import {
  getSmsSentInfoText,
  isBillingToday,
  isNewMember,
  primaryMessageActionForMember,
  shortStatus,
} from "@/lib/domain/member-actions";
import {
  isPaymentByPastDue,
  overdueDaysForMember,
  paymentByDateKey,
  inactiveDurationLabel,
} from "@/lib/domain/billing";
import { cn } from "@/lib/utils";
import { formatMemberBirthday, isMemberBirthdayToday } from "@/lib/domain/members";
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
  messageOpts,
  onToggleSelect,
  onToggleExpand,
  onEdit,
  onWhatsApp,
  onPhotoClick,
}: {
  m: Member;
  selected: boolean;
  expanded: boolean;
  isOwner: boolean;
  canEdit: boolean;
  messageOpts?: {
    settings?: {
      fineSmsEnabled?: boolean;
      fineSmsGraceDays?: number;
      fineSmsImmediateRoles?: string[];
    } | null;
    actorRole?: string | null;
  };
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onWhatsApp: (
    kind:
      | "reminder"
      | "monthReminder"
      | "welcome"
      | "fine"
      | "hold"
      | "deactivate"
      | "success"
      | "birthday",
  ) => void;
  onPhotoClick?: () => void;
}) {
  const overdue = isPaymentByPastDue(m);
  const billingToday = isBillingToday(m) && !overdue;
  const msg = primaryMessageActionForMember(m, {
    isOwner,
    settings: messageOpts?.settings,
    actorRole: messageOpts?.actorRole,
  });
  const statusSentText = msg.key !== "none" ? getSmsSentInfoText(m, msg.key) : "";
  const inactiveDuration = inactiveDurationLabel(m);
  const paymentBy = paymentByDateKey(m) || m.billingDate || "";
  const memberBirthday = formatMemberBirthday(m.dob);
  const birthdayToday = isMemberBirthdayToday(m.dob);
  const hasMobile = Boolean(String(m.mobile || "").trim());
  const birthdaySentText = getSmsSentInfoText(m, "birthday");

  return (
    <div className="space-y-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className={cn(
          "apg-member-row-card grid w-full min-w-[980px] cursor-pointer grid-cols-[22px_88px_minmax(140px,1.4fr)_90px_78px_78px_minmax(280px,1.8fr)] items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-left text-[10px] text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-[0_6px_20px_rgba(15,23,42,0.06)] dark:bg-card dark:text-foreground dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
          overdue && "apg-member-row--fine-due font-medium",
          billingToday && "apg-member-row--billing-today font-medium",
          birthdayToday &&
            !overdue &&
            "border-pink-300 bg-gradient-to-r from-pink-50 via-rose-50/80 to-white font-medium ring-1 ring-pink-200/80 dark:border-pink-500/40 dark:from-pink-950/50 dark:via-rose-950/30 dark:to-card dark:ring-pink-500/20",
          !overdue && !billingToday && !birthdayToday && "border-slate-200/90 dark:border-border",
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
          <button
            type="button"
            className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-border"
            aria-label="View member photo"
            onClick={(e) => {
              e.stopPropagation();
              onPhotoClick?.();
            }}
          >
            <MemberAvatar
              member={m}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              textClassName="h-full w-full text-[9px]"
            />
          </button>
          <span className="flex min-w-0 flex-col">
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
            {memberBirthday !== "—" ? (
              <span
                className={cn(
                  "truncate text-[9px] font-medium",
                  birthdayToday
                    ? "font-semibold text-pink-700 dark:text-pink-200"
                    : "text-pink-700 dark:text-pink-300",
                )}
              >
                {birthdayToday ? "Birthday today · " : "Birthday · "}
                {memberBirthday}
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
          {inactiveDuration ? (
            <span
              className={cn(
                "block text-[9px] font-semibold",
                String(m.status).toLowerCase() === "hold" && "text-amber-800 dark:text-amber-300",
                String(m.status).toLowerCase() === "deactivated" &&
                  "text-rose-800 dark:text-rose-300",
              )}
            >
              {inactiveDuration}
            </span>
          ) : null}
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
              onClick={(e) => {
                e.stopPropagation();
                onWhatsApp(msg.key === "none" ? "reminder" : msg.key);
              }}
              title={msg.reason || msg.label}
            >
              <MessageCircle className="h-3 w-3" />
              {msg.label}
            </Button>
          ) : null}

          {birthdayToday ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!hasMobile}
              className="h-6 shrink-0 gap-0.5 border-pink-300 bg-gradient-to-r from-pink-50 to-rose-50 px-2 text-[10px] font-semibold text-pink-800 hover:from-pink-100 hover:to-rose-100 dark:border-pink-500/30 dark:from-pink-950/40 dark:to-rose-950/30 dark:text-pink-200"
              onClick={(e) => {
                e.stopPropagation();
                onWhatsApp("birthday");
              }}
              title={
                hasMobile
                  ? birthdaySentText || "Send birthday wish on WhatsApp"
                  : "Add a mobile number to send birthday wishes"
              }
            >
              <Cake className="h-3 w-3" />
              Birthday
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
      </div>
    </div>
  );
}

export function MemberListHeader({
  sortIndicator,
  onSort,
}: {
  sortIndicator?: (field: "memberId" | "name" | "plan" | "billingDate" | "paymentBy") => string;
  onSort?: (field: "memberId" | "name" | "plan" | "billingDate" | "paymentBy") => void;
}) {
  const ind = (field: "memberId" | "name" | "plan" | "billingDate" | "paymentBy") =>
    sortIndicator ? sortIndicator(field) : "";
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
      <span className="normal-case tracking-normal">Status / Action / Messages</span>
    </div>
  );
}
