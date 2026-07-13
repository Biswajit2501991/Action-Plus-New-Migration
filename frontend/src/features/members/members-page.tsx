"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Filter,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useMembers, useSettings, useVisitors } from "@/hooks/use-data";
import { membersApi, visitorsApi } from "@/services/api";
import { checkMemberDuplicates, memberSearchHaystack } from "@/lib/domain/members";
import {
  isPaymentByPastDue,
  overdueDaysForMember,
  paymentByDateKey,
  localTodayCalendarKey,
} from "@/lib/domain/billing";
import { formatCurrency, formatDate, downloadTextFile, toCsv, cn } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member, Visitor } from "@/types";
import { isBillingToday } from "@/lib/domain/member-actions";
import { MemberExpandedDetails } from "@/features/members/member-expanded-details";
import { PaymentQrButton } from "@/features/members/payment-qr-viewer";
import { MemberCardRow, MemberListHeader } from "@/features/members/member-card-row";

const PAGE_SIZE = 10;
const STATUS_KEYS = ["Active", "Hold", "Deactivated", "Cancelled"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
type SortField = "memberId" | "name" | "plan" | "billingDate" | "paymentBy" | "joiningDate";

type MemberFilters = {
  plan: string;
  status: string;
  billingMonth: string;
  paymentMethod: string;
  staff: string;
  joinFrom: string;
  joinTo: string;
  billFrom: string;
  billTo: string;
};

const EMPTY_FILTERS: MemberFilters = {
  plan: "",
  status: "",
  billingMonth: "",
  paymentMethod: "",
  staff: "",
  joinFrom: "",
  joinTo: "",
  billFrom: "",
  billTo: "",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function ym(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function paymentByDisplay(m: Member) {
  const key = paymentByDateKey(m);
  return key || m.billingDate || "";
}

function statusBadgeVariant(status?: string) {
  if (status === "Active") return "success" as const;
  if (status === "Hold") return "warning" as const;
  if (status === "Deactivated") return "danger" as const;
  return "muted" as const;
}

export function MembersPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setAddMemberOpen = useUiStore((s) => s.setAddMemberOpen);
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data: members = [], isLoading } = useMembers();
  const { data: visitors = [] } = useVisitors();
  const { data: settings } = useSettings();

  const [tab, setTab] = useState<"members" | "visitors">("members");
  const [focusStatus, setFocusStatus] = useState<string>(params.get("status") || "");
  const [quickSearchInput, setQuickSearchInput] = useState(params.get("q") || "");
  const [appliedQuickSearch, setAppliedQuickSearch] = useState(params.get("q") || "");
  const [filters, setFilters] = useState<MemberFilters>(() => {
    try {
      const saved = localStorage.getItem("apg.v2.memberFilters");
      return saved ? { ...EMPTY_FILTERS, ...JSON.parse(saved) } : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("joiningDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [userHasSorted, setUserHasSorted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<StatusKey, number>>({
    Active: 1,
    Hold: 1,
    Deactivated: 1,
    Cancelled: 1,
  });
  const [hiddenSections, setHiddenSections] = useState<Record<StatusKey, boolean>>({
    Active: false,
    Hold: false,
    Deactivated: false,
    Cancelled: false,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [metricModal, setMetricModal] = useState<"" | "active" | "hold" | "risk" | "winback">("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [paymentFor, setPaymentFor] = useState<Member | null>(null);
  const [form, setForm] = useState({
    memberId: "",
    name: "",
    mobile: "",
    email: "",
    plan: "",
    status: "Active",
    gender: "",
    dob: "",
    joiningDate: "",
    billingDate: "",
    amount: "",
    paymentMethod: "",
    holdDuration: "",
    staff: "",
    notes: "",
  });
  const [payForm, setPayForm] = useState({ amount: "", method: "Cash", note: "" });

  useEffect(() => {
    try {
      localStorage.setItem("apg.v2.memberFilters", JSON.stringify(filters));
    } catch {
      // ignore
    }
  }, [filters]);

  useEffect(() => {
    setPages({ Active: 1, Hold: 1, Deactivated: 1, Cancelled: 1 });
    setSelectedIds([]);
  }, [filters, appliedQuickSearch, focusStatus]);

  const anyFilterActive = useMemo(
    () => Object.values(filters).some((v) => Boolean(String(v || "").trim())),
    [filters],
  );

  const applyFilters = useCallback(
    (list: Member[]) =>
      list.filter((m) => {
        if (filters.plan && m.plan !== filters.plan) return false;
        if (filters.status && m.status !== filters.status) return false;
        if (filters.paymentMethod && String(m.paymentMethod || "") !== filters.paymentMethod) return false;
        if (filters.staff && String(m.staff || m.trainerId || "") !== filters.staff) return false;
        if (filters.billingMonth) {
          const memberYm = ym(m.billingDate);
          if (memberYm !== filters.billingMonth) return false;
        }
        if (filters.joinFrom && m.joiningDate && m.joiningDate < filters.joinFrom) return false;
        if (filters.joinTo && m.joiningDate && m.joiningDate > filters.joinTo) return false;
        if (filters.billFrom && m.billingDate && m.billingDate < filters.billFrom) return false;
        if (filters.billTo && m.billingDate && m.billingDate > filters.billTo) return false;
        if (appliedQuickSearch) {
          const q = appliedQuickSearch.toLowerCase();
          const hay = [
            m.name,
            m.memberId,
            m.formNo,
            m.mobile,
            m.email,
            m.plan,
            m.status,
            m.staff,
            m.trainerId,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q) && !memberSearchHaystack(m).includes(q)) return false;
        }
        return true;
      }),
    [filters, appliedQuickSearch],
  );

  const sortMembers = useCallback(
    (list: Member[], opts?: { pinBillingToday?: boolean }) => {
      const sorted = [...list];
      const dir = sortDirection === "asc" ? 1 : -1;
      const todayKey = localTodayCalendarKey();
      const pinBillingToday = opts?.pinBillingToday !== false && !userHasSorted;
      sorted.sort((a, b) => {
        if (pinBillingToday) {
          // Default Active list: billing-date-today first, then overdue, then everyone else.
          const prA = isBillingToday(a, todayKey)
            ? 2
            : isPaymentByPastDue(a)
              ? 1
              : 0;
          const prB = isBillingToday(b, todayKey)
            ? 2
            : isPaymentByPastDue(b)
              ? 1
              : 0;
          if (prB !== prA) return prB - prA;
        }
        if (sortField === "billingDate" || sortField === "joiningDate") {
          const at = new Date(String(a[sortField] || 0)).getTime() || 0;
          const bt = new Date(String(b[sortField] || 0)).getTime() || 0;
          return (at - bt) * dir;
        }
        if (sortField === "paymentBy") {
          const at = new Date(paymentByDisplay(a) || 0).getTime() || 0;
          const bt = new Date(paymentByDisplay(b) || 0).getTime() || 0;
          return (at - bt) * dir;
        }
        const av = String(a[sortField] || "").toLowerCase();
        const bv = String(b[sortField] || "").toLowerCase();
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * dir;
      });
      return sorted;
    },
    [sortDirection, sortField, userHasSorted],
  );

  const filtered = useMemo(() => applyFilters(members), [members, applyFilters]);

  const grouped = useMemo(() => {
    const base = applyFilters(members);
    return {
      Active: sortMembers(base.filter((m) => m.status === "Active"), { pinBillingToday: true }),
      Hold: sortMembers(base.filter((m) => m.status === "Hold"), { pinBillingToday: false }),
      Deactivated: sortMembers(base.filter((m) => m.status === "Deactivated"), {
        pinBillingToday: false,
      }),
      Cancelled: sortMembers(base.filter((m) => m.status === "Cancelled"), {
        pinBillingToday: false,
      }),
    };
  }, [members, applyFilters, sortMembers]);

  const overdueCount = useMemo(
    () => filtered.filter((m) => isPaymentByPastDue(m)).length,
    [filtered],
  );
  const totalCount =
    grouped.Active.length +
    grouped.Hold.length +
    grouped.Deactivated.length +
    grouped.Cancelled.length;

  const metricLists = {
    active: grouped.Active,
    hold: grouped.Hold,
    risk: filtered.filter((m) => isPaymentByPastDue(m)),
    winback: grouped.Deactivated,
  };

  const toggleSort = (field: SortField) => {
    setUserHasSorted(true);
    if (sortField === field) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Member = {
        ...(editing || {}),
        ...form,
        memberId: form.memberId || editing?.memberId || uid("M"),
        amount: Number(form.amount || 0),
        updatedAt: new Date().toISOString(),
      };
      const dups = checkMemberDuplicates(members, payload, editing?.memberId || "");
      if (dups.duplicatePhone || dups.duplicateMemberId) {
        throw new Error("Duplicate phone or member ID detected");
      }
      if (!payload.name?.trim() || !payload.mobile?.trim() || !payload.plan || !payload.status) {
        throw new Error("Name, mobile, plan and status are required");
      }
      if (!editing) throw new Error("Use Add New Member wizard to create members");
      return membersApi.patch(editing.memberId, payload);
    },
    onSuccess: async () => {
      toast.success("Member updated");
      setShowForm(false);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => membersApi.remove(id),
    onSuccess: async () => {
      toast.success("Member deleted");
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ ids, status, holdDuration }: { ids: string[]; status: string; holdDuration?: string }) => {
      await Promise.all(
        ids.map((id) => {
          const current = members.find((m) => m.memberId === id);
          if (!current) return Promise.resolve(null);
          return membersApi.patch(id, {
            ...current,
            status,
            ...(status === "Hold" ? { holdDuration: holdDuration || settings?.holdDurations?.[0] || "1 Month" } : {}),
            updatedAt: new Date().toISOString(),
          });
        }),
      );
    },
    onSuccess: async () => {
      toast.success("Status updated");
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentFor) return;
      return membersApi.addPayment(paymentFor.memberId, {
        id: uid("pay"),
        amount: Number(payForm.amount || 0),
        method: payForm.method,
        note: payForm.note,
        paidAt: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      toast.success("Payment recorded");
      setPaymentFor(null);
      setPayForm({ amount: "", method: "Cash", note: "" });
      await qc.invalidateQueries({ queryKey: ["members"] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visitorSave = useMutation({
    mutationFn: async (visitor: Visitor) =>
      visitorsApi.bulk([visitor, ...visitors.filter((v) => v.id !== visitor.id)]),
    onSuccess: async () => {
      toast.success("Visitor saved");
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setShowForm(false);
    setAddMemberOpen(true);
  };

  useEffect(() => {
    if (params.get("add") === "1") {
      setAddMemberOpen(true);
      router.replace("/members");
    }
  }, [params, router, setAddMemberOpen]);

  const openEdit = (m: Member) => {
    setEditing(m);
    setForm({
      memberId: m.memberId || "",
      name: m.name || "",
      mobile: m.mobile || "",
      email: m.email || "",
      plan: m.plan || "",
      status: String(m.status || "Active"),
      gender: m.gender || "",
      dob: m.dob ? String(m.dob).slice(0, 10) : "",
      joiningDate: m.joiningDate ? String(m.joiningDate).slice(0, 10) : "",
      billingDate: m.billingDate ? String(m.billingDate).slice(0, 10) : "",
      amount: String(m.amount ?? ""),
      paymentMethod: String(m.paymentMethod || settings?.paymentMethods?.[0] || "Cash"),
      holdDuration: m.holdDuration || "",
      staff: String(m.staff || m.trainerId || ""),
      notes: m.notes || "",
    });
    setShowForm(true);
  };

  const openWhatsApp = (
    m: Member,
    kind:
      | "reminder"
      | "monthReminder"
      | "welcome"
      | "fine"
      | "hold"
      | "deactivate"
      | "success" = "reminder",
  ) => {
    if (!m.mobile) {
      toast.error("No mobile number on this member");
      return;
    }
    const phone = String(m.mobile).replace(/\D/g, "");
    const days = overdueDaysForMember(m);
    const text =
      kind === "welcome"
        ? `Welcome to Action Plus Gym, ${m.name || ""}!`
        : kind === "fine"
          ? `Hi ${m.name || ""}, your payment is overdue by ${days} day${days === 1 ? "" : "s"}. Please clear dues at Action Plus Gym.`
          : kind === "hold"
            ? `Hi ${m.name || ""}, your membership is on Hold. Contact Action Plus Gym for details.`
            : kind === "deactivate"
              ? `Hi ${m.name || ""}, your membership is Deactivated. Contact Action Plus Gym to reactivate.`
              : kind === "success"
                ? `Hi ${m.name || ""}, payment received successfully at Action Plus Gym. Thank you!`
                : kind === "monthReminder"
                  ? `Hi ${m.name || ""}, this is your monthly payment reminder from Action Plus Gym.`
                  : `Hi ${m.name || ""}, this is a payment reminder from Action Plus Gym.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");

    const sentAt = new Date().toISOString();
    const sentBy = String(user?.name || user?.email || "Staff").trim() || "Staff";
    const prevLast =
      m.lastSmsSent && typeof m.lastSmsSent === "object"
        ? (m.lastSmsSent as Record<string, unknown>)
        : {};
    const prevHistory = Array.isArray(m.messageHistory)
      ? (m.messageHistory as Record<string, unknown>[])
      : [];
    void membersApi
      .patch(m.memberId, {
        lastSmsSent: {
          ...prevLast,
          [kind]: { sentAt, sentBy },
        },
        messageHistory: [
          {
            channel: "whatsapp",
            status: "opened",
            templateKey: kind,
            sentAt,
            sentBy,
            ts: sentAt,
          },
          ...prevHistory,
        ].slice(0, 80),
      } as Partial<Member>)
      .then(() => qc.invalidateQueries({ queryKey: ["members"] }))
      .catch(() => {
        /* chip refresh is best-effort; WhatsApp already opened */
      });
  };

  const openWelcomeMail = (m: Member) => {
    if (!m.email) {
      toast.error("No email on this member");
      return;
    }
    const subject = encodeURIComponent(`Welcome to Action Plus Gym — ${m.name || m.memberId}`);
    const body = encodeURIComponent(
      `Hi ${m.name || ""},\n\nWelcome to Action Plus Gym! We're glad to have you as a member.\n\nMember ID: ${m.memberId}\nPlan: ${m.plan || "—"}\n\nRegards,\nAction Plus Gym`,
    );
    window.open(`mailto:${m.email}?subject=${subject}&body=${body}`, "_blank");
  };

  const uploadMemberDocument = async (m: Member, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Document must be 10MB or smaller");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const prev = Array.isArray(m.attachments) ? (m.attachments as Record<string, unknown>[]) : [];
      const next = [
        {
          id: uid("doc"),
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
          uploadedAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20);
      await membersApi.patch(m.memberId, { attachments: next } as Partial<Member>);
      toast.success("Document uploaded");
      await qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const sectionsToShow = (focusStatus ? [focusStatus] : [...STATUS_KEYS]) as StatusKey[];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Members"
        description="Production member workflows with the new Action Plus UI."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadTextFile("members.csv", toCsv(filtered as unknown as Record<string, unknown>[]))}>
              Export CSV
            </Button>
            {hasAccess(user, "members", "addMembers") ? (
              <Button className="bg-sky-600 text-white hover:bg-sky-700" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add New Member
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-1 flex flex-wrap gap-2">
        <Button variant={tab === "members" ? "default" : "outline"} size="sm" onClick={() => setTab("members")}>
          Members ({totalCount})
        </Button>
        {hasAccess(user, "members", "viewVisitors") ? (
          <Button variant={tab === "visitors" ? "default" : "outline"} size="sm" onClick={() => setTab("visitors")}>
            Visitors ({visitors.length})
          </Button>
        ) : null}
      </div>

      {tab === "visitors" ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <Button
              size="sm"
              onClick={() => {
                const name = prompt("Visitor name");
                if (!name) return;
                const mobile = prompt("Mobile") || "";
                visitorSave.mutate({ id: uid("V"), name, mobile, visitDate: new Date().toISOString() });
              }}
            >
              Add visitor
            </Button>
            {visitors.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.mobile} · {formatDate(v.visitDate)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await visitorsApi.remove(v.id);
                    await qc.invalidateQueries({ queryKey: ["visitors"] });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            {!visitors.length ? <EmptyState title="No visitors yet" /> : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5">
                <h2 className="shrink-0 text-sm font-semibold md:text-base">Members</h2>
                <span className="shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {totalCount}
                </span>
                <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
                <div className="inline-flex shrink-0 items-center gap-1">
                  {[
                    { key: "", label: "All Members" },
                    { key: "Active", label: `Active Members (${grouped.Active.length})` },
                    { key: "Hold", label: `Hold Members (${grouped.Hold.length})` },
                    { key: "Deactivated", label: `Deactivated Members (${grouped.Deactivated.length})` },
                    { key: "Cancelled", label: `Cancelled Members (${grouped.Cancelled.length})` },
                  ].map((chip) => {
                    const active = (focusStatus || "") === chip.key;
                    const tone =
                      chip.key === "Active"
                        ? [
                            "border-emerald-600 bg-emerald-600 text-white ring-1 ring-emerald-300 dark:ring-emerald-800",
                            "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                          ]
                        : chip.key === "Hold"
                          ? [
                              "border-amber-500 bg-amber-500 text-white ring-1 ring-amber-300 dark:ring-amber-800",
                              "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                            ]
                          : chip.key === "Deactivated"
                            ? [
                                "border-pink-600 bg-pink-600 text-white ring-1 ring-pink-300 dark:ring-pink-800",
                                "border-pink-200 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
                              ]
                            : chip.key === "Cancelled"
                              ? [
                                  "border-slate-700 bg-slate-700 text-white ring-1 ring-slate-300 dark:border-slate-500 dark:bg-slate-600 dark:ring-slate-700",
                                  "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
                                ]
                              : [
                                  "border-sky-600 bg-sky-600 text-white ring-1 ring-sky-300 dark:ring-sky-800",
                                  "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
                                ];
                    return (
                      <button
                        key={chip.key || "all"}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFocusStatus(chip.key)}
                        className={cn(
                          "inline-flex h-6 shrink-0 items-center rounded-lg border px-1.5 text-[10px] font-semibold leading-none transition-all duration-150",
                          active ? tone[0] : tone[1],
                        )}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
                <div className="relative inline-flex shrink-0 items-center gap-1">
                  <PaymentQrButton className="!h-6 gap-1 !px-2 !text-[10px]" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => setActionsOpen((v) => !v)}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                    Actions
                    {selectedIds.length ? (
                      <span className="rounded-full bg-foreground px-1 text-[9px] text-background">
                        {selectedIds.length}
                      </span>
                    ) : null}
                  </Button>
                  {actionsOpen ? (
                    <div className="absolute right-0 top-8 z-30 min-w-[230px] rounded-xl border bg-background p-2 shadow-xl">
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          router.push("/finance");
                          setActionsOpen(false);
                        }}
                      >
                        Add Expense
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          toast.message("CSV import uses the same Members API — paste/export workflow available via Export CSV for now.");
                          setActionsOpen(false);
                        }}
                      >
                        Import CSV
                      </button>
                      {selectedIds.length ? (
                        <>
                          <div className="my-1 border-t" />
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              statusMutation.mutate({ ids: selectedIds, status: "Active" });
                              setActionsOpen(false);
                            }}
                          >
                            Bulk Activate ({selectedIds.length})
                          </button>
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              statusMutation.mutate({
                                ids: selectedIds,
                                status: "Hold",
                                holdDuration: settings?.holdDurations?.[0] || "1 Month",
                              });
                              setActionsOpen(false);
                            }}
                          >
                            Bulk Hold ({selectedIds.length})
                          </button>
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              statusMutation.mutate({ ids: selectedIds, status: "Deactivated" });
                              setActionsOpen(false);
                            }}
                          >
                            Bulk Deactivate ({selectedIds.length})
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { key: "active" as const, label: "ACTIVE MEMBERS", value: grouped.Active.length, hint: "View in table →", tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" },
              { key: "hold" as const, label: "HOLD MEMBERS", value: grouped.Hold.length, hint: "View in table →", tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" },
              { key: "risk" as const, label: "RISK ALERT", value: overdueCount, hint: "Billing overdue →", tone: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300" },
              { key: "winback" as const, label: "WIN-BACK OPPORTUNITY", value: grouped.Deactivated.length, hint: "Deactivated members →", tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300" },
            ].map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setMetricModal(card.key)}
                className={cn("rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md", card.tone)}
              >
                <div className="text-xs font-semibold">{card.label}</div>
                <div className="mt-1 text-[28px] font-bold leading-none">{card.value}</div>
                <div className="mt-1 text-xs opacity-80">{card.hint}</div>
              </button>
            ))}
          </div>

          {sectionsToShow.map((key) => {
            const list = grouped[key] || [];
            const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            const page = pages[key] > totalPages ? 1 : pages[key];
            const start = (page - 1) * PAGE_SIZE;
            const pageList = list.slice(start, start + PAGE_SIZE);

            return (
              <div key={key} className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h3
                    className={cn(
                      "inline-flex w-fit items-center rounded-xl border px-3 py-1.5 text-base font-semibold md:text-lg",
                      key === "Active" &&
                        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                      key === "Hold" &&
                        "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                      key === "Deactivated" &&
                        "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
                      key === "Cancelled" &&
                        "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
                    )}
                  >
                    {key} Members ({list.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {key === "Active" ? (
                      <>
                        <div className="relative w-full sm:w-[260px]">
                          <Input
                            value={quickSearchInput}
                            onChange={(e) => {
                              const next = e.target.value;
                              setQuickSearchInput(next);
                              if (!next.trim()) setAppliedQuickSearch("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setAppliedQuickSearch(quickSearchInput.trim());
                            }}
                            placeholder="Search members..."
                            className="pr-10"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setAppliedQuickSearch(quickSearchInput.trim())}
                            aria-label="Search"
                          >
                            <Search className="h-4 w-4" />
                          </button>
                        </div>
                        <Button
                          variant={anyFilterActive ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilterOpen(true)}
                        >
                          <Filter className="h-4 w-4" />
                          Filter
                          {anyFilterActive ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setHiddenSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    >
                      {hiddenSections[key] ? "Show" : "Hide"}
                    </Button>
                  </div>
                </div>

                {!hiddenSections[key] ? (
                  <Card>
                    <CardContent className="space-y-1.5 p-2 sm:p-3">
                      <div className="overflow-x-auto">
                        <div className="space-y-1.5">
                          <MemberListHeader sortIndicator={sortIndicator} onSort={toggleSort} />
                          {pageList.map((m) => {
                            const expanded = expandedId === m.memberId;
                            const isOwner =
                              String(user?.id || "").toLowerCase() === "owner" ||
                              String(user?.staffRole || "").toLowerCase() === "master_owner";
                            return (
                              <Fragment key={m.memberId}>
                                <MemberCardRow
                                  m={m}
                                  selected={selectedIds.includes(m.memberId)}
                                  expanded={expanded}
                                  isOwner={isOwner}
                                  canEdit={hasAccess(user, "members", "editMembers")}
                                  onToggleSelect={() => toggleSelect(m.memberId)}
                                  onToggleExpand={() =>
                                    setExpandedId((prev) => (prev === m.memberId ? null : m.memberId))
                                  }
                                  onEdit={() => openEdit(m)}
                                  onWhatsApp={(kind) => openWhatsApp(m, kind)}
                                />
                                {expanded ? (
                                  <div className="rounded-xl border border-border/70 bg-slate-50/80 px-3 py-3 dark:bg-slate-900/40">
                                    <MemberExpandedDetails
                                      m={m}
                                      isOwner={isOwner}
                                      canEdit={hasAccess(user, "members", "editMembers")}
                                      canDelete={
                                        hasAccess(user, "members", "deleteMembers") || isOwner
                                      }
                                      holdOptions={
                                        settings?.holdDurations || ["1 Month", "2 Months", "3 Months"]
                                      }
                                      onEdit={() => openEdit(m)}
                                      onAddPayment={() => setPaymentFor(m)}
                                      onWhatsApp={(kind) => openWhatsApp(m, kind)}
                                      onWelcomeMail={() => openWelcomeMail(m)}
                                      onUploadDocument={(file) => void uploadMemberDocument(m, file)}
                                      onDelete={() => {
                                        if (confirm(`Delete ${m.name || m.memberId}?`)) {
                                          deleteMutation.mutate(m.memberId);
                                        }
                                      }}
                                      onStatusChange={(status, holdDuration) => {
                                        statusMutation.mutate({
                                          ids: [m.memberId],
                                          status,
                                          holdDuration,
                                        });
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </Fragment>
                            );
                          })}
                          {!pageList.length ? (
                            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-[11px] text-muted-foreground">
                              No {key.toLowerCase()} members match your filters.
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {list.length > PAGE_SIZE ? (
                        <div className="flex items-center justify-between border-t px-2 py-3 text-sm">
                          <div className="text-muted-foreground">
                            Showing {start + 1}–{Math.min(start + PAGE_SIZE, list.length)} of {list.length}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page <= 1}
                              onClick={() => setPages((p) => ({ ...p, [key]: Math.max(1, page - 1) }))}
                            >
                              Prev
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page >= totalPages}
                              onClick={() => setPages((p) => ({ ...p, [key]: Math.min(totalPages, page + 1) }))}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            );
          })}
        </>
      )}

      {filterOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Member filters</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Plan</Label>
                <Select className="mt-1" value={filters.plan} onChange={(e) => setFilters({ ...filters, plan: e.target.value })}>
                  <option value="">All plans</option>
                  {(settings?.plans || []).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select className="mt-1" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="">All statuses</option>
                  {(settings?.statuses || STATUS_KEYS).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Payment method</Label>
                <Select className="mt-1" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}>
                  <option value="">All methods</option>
                  {(settings?.paymentMethods || []).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Billing month</Label>
                <Input className="mt-1" type="month" value={filters.billingMonth} onChange={(e) => setFilters({ ...filters, billingMonth: e.target.value })} />
              </div>
              <div>
                <Label>Joined from</Label>
                <Input className="mt-1" type="date" value={filters.joinFrom} onChange={(e) => setFilters({ ...filters, joinFrom: e.target.value })} />
              </div>
              <div>
                <Label>Joined to</Label>
                <Input className="mt-1" type="date" value={filters.joinTo} onChange={(e) => setFilters({ ...filters, joinTo: e.target.value })} />
              </div>
              <div>
                <Label>Bill from</Label>
                <Input className="mt-1" type="date" value={filters.billFrom} onChange={(e) => setFilters({ ...filters, billFrom: e.target.value })} />
              </div>
              <div>
                <Label>Bill to</Label>
                <Input className="mt-1" type="date" value={filters.billTo} onChange={(e) => setFilters({ ...filters, billTo: e.target.value })} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</Button>
              <Button onClick={() => setFilterOpen(false)}>Apply</Button>
            </div>
          </div>
        </div>
      ) : null}

      {metricModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMetricModal("")}>
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {metricModal === "active"
                    ? "Active Members"
                    : metricModal === "hold"
                      ? "Hold Members"
                      : metricModal === "risk"
                        ? "Risk Alert"
                        : "Win-back Opportunity"}
                </h2>
                <p className="text-sm text-muted-foreground">{metricLists[metricModal].length} members</p>
              </div>
              <Button variant="ghost" onClick={() => setMetricModal("")}>✕</Button>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Bill Date</th>
                    <th className="px-4 py-3">Payment By</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metricLists[metricModal].map((m) => (
                    <tr
                      key={m.memberId}
                      className="cursor-pointer border-b border-border/60 hover:bg-accent/40"
                      onClick={() => {
                        setMetricModal("");
                        openEdit(m);
                      }}
                    >
                      <td className="px-4 py-3">{m.memberId}</td>
                      <td className="px-4 py-3">{m.name || "—"}</td>
                      <td className="px-4 py-3">{m.mobile || "—"}</td>
                      <td className="px-4 py-3">{m.plan || "—"}</td>
                      <td className="px-4 py-3">{formatDate(m.billingDate)}</td>
                      <td className="px-4 py-3">{formatDate(paymentByDisplay(m))}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(String(m.status))}>{m.status || "Active"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {showForm && editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Edit member</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["memberId", "Member ID", "text"],
                ["name", "Full name", "text"],
                ["mobile", "Mobile", "text"],
                ["email", "Email", "email"],
                ["dob", "Date of birth", "date"],
                ["joiningDate", "Joining date", "date"],
                ["billingDate", "Billing date", "date"],
                ["amount", "Amount", "number"],
                ["staff", "Staff", "text"],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    className="mt-1"
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <Label>Plan</Label>
                <Select className="mt-1" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  <option value="">Select plan</option>
                  {(settings?.plans || []).map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {(settings?.statuses || STATUS_KEYS).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <Label>Payment method</Label>
                <Select className="mt-1" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  {(settings?.paymentMethods || ["Cash", "UPI", "Card", "Bank"]).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              {form.status === "Hold" ? (
                <div>
                  <Label>Hold duration</Label>
                  <Select className="mt-1" value={form.holdDuration} onChange={(e) => setForm({ ...form, holdDuration: e.target.value })}>
                    <option value="">Select</option>
                    {(settings?.holdDurations || ["1 Month", "2 Months", "3 Months"]).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Record payment</h2>
            <p className="text-sm text-muted-foreground">
              {paymentFor.name} · plan {paymentFor.plan || "—"}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Amount</Label>
                <Input className="mt-1" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </div>
              <div>
                <Label>Method</Label>
                <Select className="mt-1" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  {(settings?.paymentMethods || ["Cash", "UPI", "Card", "Bank"]).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Note</Label>
                <Input className="mt-1" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentFor(null)}>Cancel</Button>
              <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}>Save payment</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
