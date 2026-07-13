"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  MessageCircle,
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
import {
  isBillingToday,
  isNewMember,
  primaryMessageActionForMember,
  shortStatus,
} from "@/lib/domain/member-actions";
import { MemberExpandedDetails } from "@/features/members/member-expanded-details";

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
    (list: Member[]) => {
      const sorted = [...list];
      const dir = sortDirection === "asc" ? 1 : -1;
      const todayKey = localTodayCalendarKey();
      sorted.sort((a, b) => {
        const prA = isPaymentByPastDue(a)
          ? 2
          : isBillingToday(a, todayKey)
            ? 1
            : 0;
        const prB = isPaymentByPastDue(b)
          ? 2
          : isBillingToday(b, todayKey)
            ? 1
            : 0;
        if (prB !== prA) return prB - prA;
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
    [sortDirection, sortField],
  );

  const filtered = useMemo(() => applyFilters(members), [members, applyFilters]);

  const grouped = useMemo(() => {
    const base = applyFilters(members);
    return {
      Active: sortMembers(base.filter((m) => m.status === "Active")),
      Hold: sortMembers(base.filter((m) => m.status === "Hold")),
      Deactivated: sortMembers(base.filter((m) => m.status === "Deactivated")),
      Cancelled: sortMembers(base.filter((m) => m.status === "Cancelled")),
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

  const openWhatsApp = (m: Member, kind: "reminder" | "welcome" | "fine" | "hold" | "deactivate" = "reminder") => {
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
              : `Hi ${m.name || ""}, this is a payment reminder from Action Plus Gym.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">Members</h2>
                  <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {totalCount}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "", label: "All Members" },
                      { key: "Active", label: `Active (${grouped.Active.length})` },
                      { key: "Hold", label: `Hold (${grouped.Hold.length})` },
                      { key: "Deactivated", label: `Deactivated (${grouped.Deactivated.length})` },
                      { key: "Cancelled", label: `Cancelled (${grouped.Cancelled.length})` },
                    ].map((chip) => {
                      const active = (focusStatus || "") === chip.key;
                      return (
                        <button
                          key={chip.key || "all"}
                          type="button"
                          onClick={() => setFocusStatus(chip.key)}
                          className={cn(
                            "rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition",
                            active
                              ? "border-teal-600 bg-teal-600 text-white"
                              : "border-border bg-card text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActionsOpen((v) => !v)}>
                    <MoreHorizontal className="h-4 w-4" />
                    Actions
                    {selectedIds.length ? (
                      <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                        {selectedIds.length}
                      </span>
                    ) : null}
                  </Button>
                  {actionsOpen ? (
                    <div className="absolute right-0 top-10 z-30 min-w-[230px] rounded-xl border bg-background p-2 shadow-xl">
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
                  <h3 className="text-lg font-semibold">
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
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1040px] text-left text-[10px] leading-tight">
                          <thead>
                            <tr className="border-b bg-sky-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-sky-950/30 dark:text-sky-100">
                              <th className="w-8 px-2 py-1.5" />
                              <th className="px-2 py-1.5">
                                <button type="button" onClick={() => toggleSort("memberId")}>
                                  ID {sortIndicator("memberId")}
                                </button>
                              </th>
                              <th className="px-2 py-1.5">
                                <button type="button" onClick={() => toggleSort("name")}>
                                  Name {sortIndicator("name")}
                                </button>
                              </th>
                              <th className="px-2 py-1.5">
                                <button type="button" onClick={() => toggleSort("plan")}>
                                  Plan {sortIndicator("plan")}
                                </button>
                              </th>
                              <th className="px-2 py-1.5">
                                <button type="button" onClick={() => toggleSort("billingDate")}>
                                  Bill Date {sortIndicator("billingDate")}
                                </button>
                              </th>
                              <th className="px-2 py-1.5">
                                <button type="button" onClick={() => toggleSort("paymentBy")}>
                                  Payment By {sortIndicator("paymentBy")}
                                </button>
                              </th>
                              <th className="px-2 py-1.5 normal-case tracking-normal">Status / Action / Welcome</th>
                            </tr>
                          </thead>
                          <tbody className="text-[10px]">
                            {pageList.map((m) => {
                              const overdue = isPaymentByPastDue(m);
                              const billingToday = isBillingToday(m) && !overdue;
                              const expanded = expandedId === m.memberId;
                              const msg = primaryMessageActionForMember(m, {
                                isOwner: String(user?.id || "").toLowerCase() === "owner",
                              });
                              const isOwner =
                                String(user?.id || "").toLowerCase() === "owner" ||
                                String(user?.staffRole || "").toLowerCase() === "master_owner";
                              return (
                                <Fragment key={m.memberId}>
                                  <tr
                                    className={cn(
                                      "cursor-pointer border-b border-border/60 transition hover:bg-accent/30",
                                      overdue && "apg-member-row--fine-due font-medium",
                                      billingToday && "apg-member-row--billing-today font-medium",
                                    )}
                                    onClick={() =>
                                      setExpandedId((prev) => (prev === m.memberId ? null : m.memberId))
                                    }
                                  >
                                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        className="h-3 w-3"
                                        checked={selectedIds.includes(m.memberId)}
                                        onChange={() => toggleSelect(m.memberId)}
                                      />
                                    </td>
                                    <td className="px-2 py-1 font-medium tabular-nums">{m.memberId}</td>
                                    <td className="px-2 py-1">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-[9px] font-semibold">
                                          {m.photo || m.photoUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={String(m.photo || m.photoUrl)}
                                              alt=""
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            (m.name || "?").slice(0, 1).toUpperCase()
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1 truncate">
                                            <span className="truncate font-medium">{m.name || "—"}</span>
                                            {isNewMember(m) ? (
                                              <span className="rounded-full bg-sky-100 px-1 py-0.5 text-[8px] font-semibold uppercase text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                                                New
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="truncate px-2 py-1">{m.plan || "—"}</td>
                                    <td className="whitespace-nowrap px-2 py-1">{formatDate(m.billingDate)}</td>
                                    <td className="whitespace-nowrap px-2 py-1">
                                      <div>{formatDate(paymentByDisplay(m)) || "—"}</div>
                                      {overdue ? (
                                        <div className="text-[9px] font-semibold text-rose-700 dark:text-rose-300">
                                          Overdue by {overdueDaysForMember(m)} day
                                          {overdueDaysForMember(m) === 1 ? "" : "s"}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex flex-wrap items-center gap-1">
                                        <Badge
                                          variant={statusBadgeVariant(String(m.status))}
                                          className="min-w-[4.5rem] justify-center px-1.5 py-0 text-[9px] leading-tight"
                                        >
                                          {shortStatus(m.status || "Active")}
                                        </Badge>
                                        {hasAccess(user, "members", "editMembers") ? (
                                          <Button
                                            size="sm"
                                            className="h-6 bg-indigo-600 px-2 text-[9px] text-white hover:bg-indigo-700"
                                            onClick={() => openEdit(m)}
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
                                              "h-6 gap-0.5 px-2 text-[9px]",
                                              msg.key === "fine" &&
                                                "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
                                              msg.key === "welcome" &&
                                                "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                                              msg.key === "reminder" &&
                                                "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
                                            )}
                                            onClick={() =>
                                              openWhatsApp(
                                                m,
                                                msg.key === "none" ? "reminder" : msg.key,
                                              )
                                            }
                                            title={msg.reason || msg.label}
                                          >
                                            <MessageCircle className="h-3 w-3" />
                                            {msg.label}
                                          </Button>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-1.5"
                                          onClick={() =>
                                            setExpandedId((prev) => (prev === m.memberId ? null : m.memberId))
                                          }
                                          aria-label={expanded ? "Collapse" : "Expand"}
                                        >
                                          {expanded ? (
                                            <ChevronUp className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                  {expanded ? (
                                    <tr className="border-b bg-slate-50/80 dark:bg-slate-900/40">
                                      <td colSpan={7} className="px-3 py-3">
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
                                          onWhatsApp={() => openWhatsApp(m, "welcome")}
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
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              );
                            })}
                            {!pageList.length ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                                  No {key.toLowerCase()} members match your filters.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      {list.length > PAGE_SIZE ? (
                        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
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
