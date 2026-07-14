"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { paymentByDateKey, localCalendarDateKey, inactiveDurationLabel, isHoldOrDeactivated, monthsBetweenCalendarDates } from "@/lib/domain/billing";
import { familyMembersInGroup } from "@/lib/domain/family-link";
import { nextPaymentDateFromBillingDate } from "@/lib/domain/member-dates";
import { getSmsSentInfoText, primaryMessageActionForMember } from "@/lib/domain/member-actions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Member, Payment } from "@/types";

type DetailsViewMode = "full" | "compact";
type WhatsAppKind =
  | "reminder"
  | "monthReminder"
  | "welcome"
  | "fine"
  | "hold"
  | "deactivate"
  | "success";

type DetailField = {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  tone?: "default" | "hold";
  hint?: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPACT_HIDDEN = new Set([
  "formNo",
  "email",
  "address",
  "staff",
  "holdDuration",
  "totalHoldMonths",
  "holdNote",
]);

function dash(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function holdPolicyNote(holdMonths: number) {
  if (holdMonths > 12) return "Full Admission is mandatory";
  if (holdMonths > 6) return "Readmission fee mandatory";
  return "";
}

function injuriesNotesValue(m: Member) {
  const med =
    m && typeof m.medicalAnswers === "object" && m.medicalAnswers
      ? (m.medicalAnswers as Record<string, unknown>)
      : {};
  const injuries =
    med.injuries && typeof med.injuries === "object"
      ? (med.injuries as Record<string, unknown>)
      : {};
  const labels: string[] = [];
  if (injuries.knees) labels.push("Knees");
  if (injuries.lowerBack) labels.push("Lower Back");
  if (injuries.neckShoulders) labels.push("Neck/Shoulders");
  if (injuries.hipsPelvis) labels.push("Hips/Pelvis");
  if (injuries.flexibility) labels.push("Flexibility");
  const other = String(injuries.other || "").trim();
  if (other) labels.push(`Other: ${other}`);
  if (labels.length) return `Injuries: ${labels.join(", ")}`;
  const notes = String(m.notes || m.medicalConditions || "").trim();
  return notes || "—";
}

function payMonthDisplay(m: Member) {
  const raw = String(m.payMonth || m.pay_month || "").trim();
  if (!raw) return "—";
  const keyMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (keyMatch) {
    const y = Number(keyMatch[1]);
    const idx = Number(keyMatch[2]) - 1;
    return `${MONTHS[idx] || keyMatch[2]}-${y}`;
  }
  return raw;
}

function billingMonthLabel(row: Payment) {
  const month = String(row?.paidMonth || row?.paid_month || row?.billingMonth || "").trim();
  const mtx = month.match(/^(\d{4})-(\d{2})$/);
  if (mtx) {
    const y = Number(mtx[1]);
    const idx = Number(mtx[2]) - 1;
    return `${MONTHS[idx] || mtx[2]} ${y}`;
  }
  const dateKey = localCalendarDateKey(String(row?.billingDate || row?.paidAt || row?.paid_at || ""));
  if (dateKey) {
    const [y, m] = dateKey.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  return "—";
}

function formatPaymentDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatDate(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentRows(m: Member): Payment[] {
  const list = Array.isArray(m.paymentHistory) ? m.paymentHistory : [];
  return [...list].sort((a, b) => {
    const at = new Date(String(a.paidAt || a.paid_at || 0)).getTime() || 0;
    const bt = new Date(String(b.paidAt || b.paid_at || 0)).getTime() || 0;
    return bt - at;
  });
}

function FieldCard({ field }: { field: DetailField }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border px-2.5 py-1.5",
        field.tone === "hold"
          ? "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30"
          : field.required
            ? "border-amber-200/80 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20"
            : "border-border/70 bg-background",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide",
          field.tone === "hold"
            ? "text-rose-700 dark:text-rose-300"
            : field.required
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground",
        )}
      >
        {field.label}
        {field.required ? (
          <span className="ml-1 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            REQUIRED
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 break-words text-[11px] font-semibold text-foreground">{field.value}</div>
      {field.hint ? <div className="mt-0.5 text-[9px] text-rose-600">{field.hint}</div> : null}
    </div>
  );
}

function SectionCard({
  title,
  open,
  onToggle,
  tone = "slate",
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  tone?: "slate" | "indigo" | "emerald" | "communication";
  children: ReactNode;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
      : tone === "indigo"
        ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20"
        : tone === "communication"
          ? "border-slate-200 bg-white dark:border-border dark:bg-card"
          : "border-border/70 bg-background";
  return (
    <div className={cn("rounded-xl border p-2.5", toneClass)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 py-0.5 text-left"
      >
        <div
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            tone === "communication" ? "text-sky-600 dark:text-sky-400" : "text-foreground",
          )}
        >
          {title}
        </div>
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-border dark:bg-background dark:text-muted-foreground">
          {open ? "Hide" : "Expand"}
        </span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function SmsSentChip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span
      className="max-w-[240px] truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      title={text}
    >
      {text}
    </span>
  );
}

function CommunicationDocumentsBlock({
  m,
  canWhatsApp,
  onWhatsApp,
  onWelcomeMail,
  onUploadDocument,
}: {
  m: Member;
  canWhatsApp: boolean;
  onWhatsApp: (kind: WhatsAppKind) => void;
  onWelcomeMail: () => void;
  onUploadDocument: (file: File) => void;
}) {
  const todayKey = localCalendarDateKey(new Date());
  const joiningKey = localCalendarDateKey(m.joiningDate);
  const showWelcome = Boolean(joiningKey && todayKey && joiningKey === todayKey);
  const suggested = primaryMessageActionForMember(m);

  const types: { key: WhatsAppKind; label: string }[] = [
    { key: "reminder", label: "Reminder" },
    { key: "monthReminder", label: "Month Reminder" },
    { key: "fine", label: "Fine SMS" },
    { key: "deactivate", label: "Deactivate SMS" },
    { key: "hold", label: "Hold SMS" },
    ...(showWelcome ? [{ key: "welcome" as const, label: "Welcome SMS" }] : []),
    { key: "success", label: "Success SMS" },
  ];

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-border dark:bg-background">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-foreground">
          WhatsApp Message Types
        </div>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => {
            const highlighted = suggested.key === t.key;
            return (
              <div key={t.key} className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canWhatsApp}
                  className={cn(
                    "h-7 px-2.5 text-[10px] font-semibold",
                    highlighted
                      ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:bg-background",
                  )}
                  onClick={() => onWhatsApp(t.key)}
                >
                  {t.label}
                </Button>
                <SmsSentChip text={getSmsSentInfoText(m, t.key)} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2 dark:border-border">
        {String(m.status || "").toLowerCase() === "active" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-indigo-300 bg-indigo-50 px-2.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
            onClick={onWelcomeMail}
          >
            Send Gmail Welcome
          </Button>
        ) : null}
        <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-border dark:bg-background dark:text-foreground">
          Upload Document
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadDocument(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function FamilyUnitStrip({
  m,
  allMembers,
  canEdit,
  onNavigateMember,
  onUnlinkFamilyGroup,
}: {
  m: Member;
  allMembers: Member[];
  canEdit: boolean;
  onNavigateMember?: (member: Member) => void;
  onUnlinkFamilyGroup?: (groupId: string) => void;
}) {
  const gid = String(m.familyGroupId || m.family_group_id || "").trim();
  if (!gid) return null;
  const primaryId = String(m.familyPrimaryMemberId || m.family_primary_member_id || "").trim();
  const primary = allMembers.find((x) => x.memberId === primaryId);
  const others = familyMembersInGroup(allMembers, gid).filter((x) => x.memberId !== m.memberId);
  const phoneDisplay = m.mobile || primary?.mobile || "—";

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-slate-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
            Family unit
          </div>
          <div className="mt-1 text-[13px]">
            {primaryId === m.memberId ? (
              <span>
                <span className="font-semibold text-indigo-900 dark:text-indigo-200">Primary</span>{" "}
                contact for this number ({phoneDisplay}).
              </span>
            ) : (
              <span>
                Linked with:{" "}
                <button
                  type="button"
                  className="font-semibold text-indigo-800 underline hover:text-indigo-950 dark:text-indigo-300"
                  onClick={() => primary && onNavigateMember?.(primary)}
                >
                  {primary?.name || primaryId || "—"}
                </button>
                {" "}
                — {phoneDisplay}
              </span>
            )}
          </div>
          {others.length > 0 ? (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-700 dark:text-slate-200">Related members</div>
              <ul className="mt-1 flex flex-wrap gap-2">
                {others.map((o) => (
                  <li key={o.memberId}>
                    <button
                      type="button"
                      onClick={() => onNavigateMember?.(o)}
                      className="rounded-lg border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                    >
                      {o.name || o.memberId}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {canEdit && onUnlinkFamilyGroup ? (
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            onClick={() => onUnlinkFamilyGroup(gid)}
          >
            Unlink family
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MemberExpandedDetails({
  m,
  allMembers = [],
  isOwner,
  canEdit,
  canDelete,
  holdOptions,
  onEdit,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onEditPayMonth,
  onWhatsApp,
  onWelcomeMail,
  onUploadDocument,
  onDelete,
  onStatusChange,
  onNavigateMember,
  onUnlinkFamilyGroup,
}: {
  m: Member;
  allMembers?: Member[];
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
  holdOptions: string[];
  onEdit: () => void;
  onAddPayment: () => void;
  onEditPayment?: (payment: Payment) => void;
  onDeletePayment?: (payment: Payment) => void;
  onEditPayMonth?: (monthKey: string) => void;
  onWhatsApp: (kind: WhatsAppKind) => void;
  onWelcomeMail: () => void;
  onUploadDocument: (file: File) => void;
  onDelete: () => void;
  onStatusChange: (status: string, holdDuration?: string) => void;
  onNavigateMember?: (member: Member) => void;
  onUnlinkFamilyGroup?: (groupId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<DetailsViewMode>(() => {
    try {
      const raw = localStorage.getItem("apg.v2.memberDetails.viewMode");
      return raw === "compact" ? "compact" : "full";
    } catch {
      return "full";
    }
  });
  const [openSections, setOpenSections] = useState({
    summary: true,
    profile: false,
    membership: false,
    payments: false,
    communication: false,
  });
  const [holdSel, setHoldSel] = useState(holdOptions[0] || "1 Month");
  const [monthFilter, setMonthFilter] = useState("");

  const canWhatsApp = Boolean(String(m.mobile || "").trim());

  const isHold = String(m.status || "").trim().toLowerCase() === "hold";
  const isActive = String(m.status || "").trim().toLowerCase() === "active";
  const inactiveLabel = inactiveDurationLabel(m);
  const holdMonths = isHoldOrDeactivated(m.status)
    ? monthsBetweenCalendarDates(m.billingDate)
    : 0;
  const holdNote = holdPolicyNote(holdMonths);
  const payments = useMemo(() => paymentRows(m), [m]);
  const paymentByDate = paymentByDateKey(m) || m.billingDate || "";
  const paymentByDisplay = formatDate(paymentByDate);
  const nextPay =
    m.nextPaymentDate || nextPaymentDateFromBillingDate(m.billingDate) || "";

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of payments) {
      const label = billingMonthLabel(row);
      if (label && label !== "—") set.add(label);
    }
    return Array.from(set);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (!monthFilter) return payments;
    return payments.filter((row) => billingMonthLabel(row) === monthFilter);
  }, [payments, monthFilter]);

  const paymentTotal = filteredPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const profileFields: DetailField[] = [
    { key: "formNo", label: "Form #", value: dash(m.formNo), required: true },
    { key: "memberId", label: "ID", value: dash(m.memberId), required: true },
    { key: "name", label: "Name", value: dash(m.name), required: true },
    { key: "dob", label: "DOB", value: formatDate(m.dob), required: true },
    { key: "gender", label: "Gender", value: dash(m.gender), required: true },
    { key: "mobile", label: "Mobile", value: dash(m.mobile), required: true },
    { key: "email", label: "Email", value: dash(m.email) },
    { key: "address", label: "Address", value: dash(m.address), required: true },
    { key: "staff", label: "Staff", value: dash(m.staff || m.trainerId), required: true },
    {
      key: "assignedGymCodeId",
      label: "Branch (Gym Code)",
      value: dash(m.assignedGymCodeId || m.assigned_gym_code_id),
    },
  ];

  const membershipFields: DetailField[] = [
    {
      key: "amount",
      label: "Amount",
      value: m.amount !== undefined && m.amount !== null ? formatCurrency(Number(m.amount || 0)) : "—",
      required: true,
    },
    { key: "plan", label: "Plan", value: dash(m.plan), required: true },
    { key: "joiningDate", label: "Joining Date", value: formatDate(m.joiningDate), required: true },
    { key: "billingDate", label: "Billing Date", value: formatDate(m.billingDate), required: true },
    { key: "nextPaymentDate", label: "Next Payment Date", value: formatDate(nextPay), required: true },
    {
      key: "paymentBy",
      label: "Payment By",
      value: paymentByDisplay || "—",
      required: true,
      hint: inactiveLabel || undefined,
      tone: inactiveLabel ? ("hold" as const) : undefined,
    },
    { key: "status", label: "Status", value: dash(m.status), required: true },
    ...(isActive
      ? [{ key: "injuriesNotes", label: "Injuries / Notes", value: injuriesNotesValue(m) }]
      : []),
    { key: "holdDuration", label: "Hold Duration", value: dash(m.holdDuration) },
    ...(isHold
      ? [
          {
            key: "totalHoldMonths",
            label: "Total Hold Duration",
            value: inactiveLabel || `${holdMonths} Month${holdMonths === 1 ? "" : "s"}`,
            tone: "hold" as const,
            hint: "(calculated from Billing Date)",
          },
          ...(holdNote
            ? [
                {
                  key: "holdNote",
                  label: "Hold Note",
                  value: holdNote,
                  tone: "hold" as const,
                },
              ]
            : []),
        ]
      : []),
    { key: "paymentMethod", label: "Payment Method", value: dash(m.paymentMethod), required: true },
    {
      key: "payMonth",
      label: "Paid for Month",
      value: payMonthDisplay(m),
      required: true,
      hint: canEdit && onEditPayMonth ? "Use Edit month to change" : undefined,
    },
  ];

  const visible = (fields: DetailField[]) =>
    fields.filter((f) => {
      if (isOwner || viewMode === "full") return true;
      return !COMPACT_HIDDEN.has(f.key);
    });

  const summaryItems = [
    { label: "Plan", value: dash(m.plan) },
    {
      label: "Amount",
      value: m.amount !== undefined && m.amount !== null ? formatCurrency(Number(m.amount || 0)) : "—",
    },
    { label: "Billing Date", value: formatDate(m.billingDate) },
    {
      label: "Payment By",
      value: inactiveLabel
        ? `${paymentByDisplay || "—"}\n${inactiveLabel}`
        : paymentByDisplay || "—",
    },
    { label: "Status", value: dash(m.status) },
    {
      label: "Last Payment",
      value: payments[0]
        ? `${formatDate(String(payments[0].paidAt || payments[0].paid_at || ""))} · ${formatCurrency(Number(payments[0].amount || 0))}`
        : "—",
    },
  ];

  const setView = (mode: DetailsViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("apg.v2.memberDetails.viewMode", mode);
    } catch {
      /* ignore */
    }
  };

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const gridClass =
    viewMode === "compact"
      ? "grid grid-cols-1 gap-2 md:grid-cols-2"
      : "grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-background p-2">
        {canEdit && m.status !== "Active" ? (
          <Button
            size="sm"
            className="h-7 bg-emerald-600 text-[10px] hover:bg-emerald-700"
            onClick={() => onStatusChange("Active")}
          >
            Activate
          </Button>
        ) : null}
        {canEdit ? (
          <div className="flex items-center gap-1.5">
            <Select
              className="h-7 w-[110px] text-[10px]"
              value={holdSel}
              onChange={(e) => setHoldSel(e.target.value)}
            >
              {holdOptions.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 text-[10px] text-amber-800 hover:bg-amber-50"
              onClick={() => onStatusChange("Hold", holdSel)}
            >
              Hold
            </Button>
          </div>
        ) : null}
        {canEdit && m.status !== "Deactivated" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-rose-300 text-[10px] text-rose-700 hover:bg-rose-50"
            onClick={() => onStatusChange("Deactivated")}
          >
            Deactivate
          </Button>
        ) : null}
        {canEdit ? (
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onEdit}>
            Edit member
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() => {
            const suggested = primaryMessageActionForMember(m, { isOwner });
            onWhatsApp(
              suggested.key !== "none" ? suggested.key : "reminder",
            );
          }}
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </Button>
        {canDelete ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-rose-300 text-[10px] text-rose-700 hover:bg-rose-50"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        ) : null}
      </div>

      <FamilyUnitStrip
        m={m}
        allMembers={allMembers}
        canEdit={canEdit}
        onNavigateMember={onNavigateMember}
        onUnlinkFamilyGroup={onUnlinkFamilyGroup}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background p-2">
        <div className="text-[11px] font-semibold text-muted-foreground">Member Details View</div>
        <div className="inline-flex rounded-lg border border-border/70 p-0.5">
          <button
            type="button"
            onClick={() => setView("full")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[10px] font-semibold",
              viewMode === "full" ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Full
          </button>
          <button
            type="button"
            onClick={() => setView("compact")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[10px] font-semibold",
              viewMode === "compact" ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Compact
          </button>
        </div>
      </div>

      <SectionCard
        title="Quick Summary"
        open={openSections.summary}
        onToggle={() => toggle("summary")}
        tone="indigo"
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-border/70 bg-background px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
              <div className="mt-0.5 whitespace-pre-line text-[11px] font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Profile" open={openSections.profile} onToggle={() => toggle("profile")}>
        <div className={gridClass}>
          {visible(profileFields).map((field) => (
            <FieldCard key={field.key} field={field} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Membership"
        open={openSections.membership}
        onToggle={() => toggle("membership")}
      >
        <div className={gridClass}>
          {visible(membershipFields).map((field) => (
            <FieldCard key={field.key} field={field} />
          ))}
        </div>
        {canEdit && onEditPayMonth ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="month"
              className="h-8 rounded-lg border border-slate-200 bg-background px-2 text-xs dark:border-border"
              defaultValue={(() => {
                const raw = String(m.payMonth || m.pay_month || "").trim();
                if (/^\d{4}-\d{2}$/.test(raw)) return raw;
                return "";
              })()}
              onBlur={(e) => {
                const next = e.target.value;
                if (next && next !== String(m.payMonth || m.pay_month || "")) {
                  onEditPayMonth(next);
                }
              }}
            />
            <span className="text-[10px] text-muted-foreground">
              Change paid-for-month (YYYY-MM)
            </span>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Payments"
        open={openSections.payments}
        onToggle={() => toggle("payments")}
        tone="emerald"
      >
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              Payment History (Month-wise)
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {monthOptions.length > 0 ? (
                <label className="flex items-center gap-1 text-[10px] text-emerald-800 dark:text-emerald-300">
                  <span>Month</span>
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="rounded border border-emerald-300 bg-background px-1.5 py-0.5 text-[10px]"
                  >
                    <option value="">All</option>
                    {monthOptions.map((mk) => (
                      <option key={mk} value={mk}>
                        {mk}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Total Paid: {formatCurrency(paymentTotal)}
                {monthFilter ? ` (${monthFilter})` : ""}
              </span>
              <Button size="sm" className="h-7 text-[10px]" onClick={onAddPayment}>
                Add Payment
              </Button>
            </div>
          </div>

          {!filteredPayments.length ? (
            <div className="text-[10px] text-muted-foreground">
              {!payments.length ? "No payment records yet." : "No payments for the selected month."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-background dark:border-emerald-900">
              <table className="min-w-full text-[10px]">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <th className="px-2 py-1 text-left font-semibold">Paid for Month</th>
                    <th className="px-2 py-1 text-left font-semibold">Amount</th>
                    <th className="px-2 py-1 text-left font-semibold">Payment Date</th>
                    <th className="px-2 py-1 text-left font-semibold">Method</th>
                    <th className="px-2 py-1 text-left font-semibold">Recorded By</th>
                    <th className="px-2 py-1 text-left font-semibold">Source</th>
                    {canEdit || isOwner ? (
                      <th className="px-2 py-1 text-right font-semibold">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((row, idx) => (
                    <tr key={String(row.id || idx)} className="border-t border-emerald-100 dark:border-emerald-900/50">
                      <td className="whitespace-nowrap px-2 py-1">{billingMonthLabel(row)}</td>
                      <td className="whitespace-nowrap px-2 py-1 font-semibold">
                        {formatCurrency(Number(row.amount || 0))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {formatPaymentDateTime(String(row.paidAt || row.paid_at || ""))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">{dash(row.method)}</td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {dash(row.recordedBy || row.recorded_by)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 capitalize">
                        {dash(row.source)}
                      </td>
                      {canEdit || isOwner ? (
                        <td className="whitespace-nowrap px-2 py-1 text-right">
                          <div className="inline-flex gap-1">
                            {canEdit && onEditPayment && row.id ? (
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                                onClick={() => onEditPayment(row)}
                              >
                                Edit
                              </button>
                            ) : null}
                            {isOwner && onDeletePayment && row.id ? (
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                onClick={() => onDeletePayment(row)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Communication & Documents"
        open={openSections.communication}
        onToggle={() => toggle("communication")}
        tone="communication"
      >
        <CommunicationDocumentsBlock
          m={m}
          canWhatsApp={canWhatsApp}
          onWhatsApp={onWhatsApp}
          onWelcomeMail={onWelcomeMail}
          onUploadDocument={onUploadDocument}
        />
      </SectionCard>
    </div>
  );
}
