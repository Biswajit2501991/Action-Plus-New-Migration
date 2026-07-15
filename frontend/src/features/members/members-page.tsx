"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { AccentMetricCard } from "@/components/ui/accent-metric-card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useMembers, useSettings, useVisitors, useGymCodes } from "@/hooks/use-data";
import { useMemberPhotoHydration } from "@/hooks/use-member-photo-hydration";
import { membersApi, logsApi, whatsappApi } from "@/services/api";
import {
  addMemberDeleteTombstone,
  removeMemberDeleteTombstone,
  sanitizeMembersForDisplay,
} from "@/lib/domain/member-delete-tombstones";
import {
  clearPendingMemberDelete,
  markPendingMemberDelete,
} from "@/lib/domain/member-pending-deletes";
import {
  patchMemberWithOfflineFallback,
  permanentDeleteWithOfflineFallback,
} from "@/lib/member-write";
import { useOfflineQueueFlush } from "@/hooks/use-offline-queue-flush";
import {
  QuickFieldEditModal,
  type QuickFieldEditState,
} from "@/features/members/quick-field-edit-modal";
import { MemberPhotoPreviewModal } from "@/features/members/member-photo-modals";
import { EditMemberModal } from "@/features/members/edit-member-modal";
import {
  MemberMetricModal,
  type MetricModalKey,
} from "@/features/members/member-metric-modal";
import { memberSearchHaystack, isMemberBirthdayThisMonth, birthdayDayOfMonthSortKey, normalizePhone } from "@/lib/domain/members";
import {
  daysBetweenCalendarDates,
  getReactivationFeeRule,
  isHoldOrDeactivated,
  isPaymentByPastDue,
  paymentByDateKey,
  localTodayCalendarKey,
  localCalendarDateKey,
} from "@/lib/domain/billing";
import {
  nextPaymentDateFromBillingDate,
  paymentByFromBillingDate,
} from "@/lib/domain/member-dates";
import { formatCurrency, formatDate, downloadTextFile, toCsv, cn, formatMonthKey } from "@/lib/utils";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member, Payment } from "@/types";
import { isBillingToday, isNewMember } from "@/lib/domain/member-actions";
import { openGmailWelcome } from "@/lib/domain/gmail-welcome";
import { MemberExpandedDetails } from "@/features/members/member-expanded-details";
import { PaymentQrButton } from "@/features/members/payment-qr-viewer";
import { MemberCardRow, MemberListHeader } from "@/features/members/member-card-row";
import { PaymentEntryModal, type PaymentFormValues } from "@/features/members/payment-entry-modal";
import { PaidForMonthOverrideDialog } from "@/features/members/paid-for-month-override-dialog";
import {
  ReactivationFeeModal,
  buildReactivationFeePrompt,
  type ReactivationFeePrompt,
} from "@/features/members/reactivation-fee-modal";
import { CsvImportModal } from "@/features/members/csv-import-modal";
import {
  mergeCsvImportIntoMembers,
  prepareCsvImportRows,
  type CsvImportPreparedRow,
} from "@/lib/domain/csv-import";
import {
  buildWhatsAppCallMemberPatch,
  buildWhatsAppCallSmsEvent,
  buildWhatsAppCallUrl,
  formatWhatsAppPhone,
} from "@/lib/domain/whatsapp";
import { VisitorsPanel } from "@/features/visitors/visitors-panel";
import { MessagePreviewModal } from "@/features/whatsapp/message-preview-modal";
import { useWhatsappSend } from "@/features/whatsapp/use-whatsapp-send";
import { pushHistoryCheckpoint } from "@/lib/history-stack";

const PAGE_SIZE = 10;
const STATUS_KEYS = ["Active", "Hold", "Deactivated", "Cancelled"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
type SectionKey = StatusKey | "Birthday";
const BIRTHDAY_ELIGIBLE_STATUSES = new Set(["Active", "Hold", "Deactivated"]);
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

function paymentBySortKey(m: Member) {
  if (isHoldOrDeactivated(m.status)) {
    return String(daysBetweenCalendarDates(m.billingDate)).padStart(8, "0");
  }
  return paymentByDisplay(m);
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
  const { data: gymCodes = [] } = useGymCodes();
  const {
    preview: waPreview,
    sending: waSending,
    openPreview: openWhatsAppPreview,
    closePreview: closeWhatsAppPreview,
    confirmSend: confirmWhatsAppSend,
  } = useWhatsappSend();

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
  const [draftFilters, setDraftFilters] = useState<MemberFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("joiningDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<SectionKey, number>>({
    Active: 1,
    Birthday: 1,
    Hold: 1,
    Deactivated: 1,
    Cancelled: 1,
  });
  const [hiddenSections, setHiddenSections] = useState<Record<SectionKey, boolean>>({
    Active: false,
    Birthday: false,
    Hold: false,
    Deactivated: false,
    Cancelled: false,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [metricModal, setMetricModal] = useState<MetricModalKey | "">("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [paymentFor, setPaymentFor] = useState<Member | null>(null);
  const [photoPreviewMember, setPhotoPreviewMember] = useState<Member | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [payMonthEdit, setPayMonthEdit] = useState<{
    member: Member;
    monthKey: string;
    amount: number;
  } | null>(null);
  const [reactivationPrompt, setReactivationPrompt] = useState<ReactivationFeePrompt | null>(
    null,
  );
  const [feeQueue, setFeeQueue] = useState<string[]>([]);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvImport, setCsvImport] = useState<{
    open: boolean;
    fileName: string;
    rows: CsvImportPreparedRow[];
    summary: { added: number; updated: number; skipped: number };
  }>({ open: false, fileName: "", rows: [], summary: { added: 0, updated: 0, skipped: 0 } });
  const [quickFieldEdit, setQuickFieldEdit] = useState<QuickFieldEditState | null>(null);
  const [quickFieldSaving, setQuickFieldSaving] = useState(false);

  const { pendingCount: offlinePendingCount } = useOfflineQueueFlush(Boolean(user));

  const actorRole = String(user?.staffRole || user?.role || user?.id || "").trim();
  const messageOpts = useMemo(
    () => ({ settings: settings || null, actorRole }),
    [settings, actorRole],
  );

  useEffect(() => {
    // Applied filters persist for this browser so staff keep their saved filter set.
    try {
      localStorage.setItem("apg.v2.memberFilters", JSON.stringify(filters));
    } catch {
      // ignore
    }
  }, [filters]);

  useEffect(() => {
    setPages({ Active: 1, Birthday: 1, Hold: 1, Deactivated: 1, Cancelled: 1 });
    setSelectedIds([]);
  }, [filters, appliedQuickSearch, focusStatus]);

  const anyFilterActive = useMemo(
    () => Object.values(filters).some((v) => Boolean(String(v || "").trim())),
    [filters],
  );
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => Boolean(String(v || "").trim())).length,
    [filters],
  );

  const openFilterPanel = () => {
    setDraftFilters({ ...filters });
    setFilterOpen(true);
  };

  const saveFilters = () => {
    setFilters({ ...draftFilters });
    setFilterOpen(false);
    const count = Object.values(draftFilters).filter((v) => Boolean(String(v || "").trim())).length;
    toast.success(count ? `Filter saved · ${count} active` : "Filters cleared and saved");
  };

  const clearDraftFilters = () => setDraftFilters({ ...EMPTY_FILTERS });

  const clearAndSaveFilters = () => {
    setDraftFilters({ ...EMPTY_FILTERS });
    setFilters({ ...EMPTY_FILTERS });
    setFilterOpen(false);
    toast.success("Filters cleared");
  };

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
    (list: Member[], opts?: { prioritizeActiveSpotlight?: boolean }) => {
      const sorted = [...list];
      const dir = sortDirection === "asc" ? 1 : -1;
      const todayKey = localTodayCalendarKey();
      const spotlight = opts?.prioritizeActiveSpotlight !== false;

      const getPriority = (m: Member) => {
        const joiningToday = localCalendarDateKey(m.joiningDate) === todayKey;
        const newAdmission = joiningToday || isNewMember(m);
        const billingToday = isBillingToday(m, todayKey);
        const overdue = isPaymentByPastDue(m, { asOfKey: todayKey });

        // Active list: billing-today + new admissions first, then overdue, then rest.
        if (spotlight) {
          if (billingToday && newAdmission) return 5;
          if (billingToday) return 4;
          if (newAdmission) return 3;
          if (overdue) return 2;
          return 0;
        }

        if (overdue) return 2;
        if (billingToday) return 1;
        return 0;
      };

      sorted.sort((a, b) => {
        const prA = getPriority(a);
        const prB = getPriority(b);
        if (prB !== prA) return prB - prA;
        if (sortField === "billingDate" || sortField === "joiningDate") {
          const at = new Date(String(a[sortField] || 0)).getTime() || 0;
          const bt = new Date(String(b[sortField] || 0)).getTime() || 0;
          return (at - bt) * dir;
        }
        if (sortField === "paymentBy") {
          const at = paymentBySortKey(a);
          const bt = paymentBySortKey(b);
          if (at === bt) return 0;
          return (at > bt ? 1 : -1) * dir;
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
      Active: sortMembers(base.filter((m) => m.status === "Active"), {
        prioritizeActiveSpotlight: true,
      }),
      Hold: sortMembers(base.filter((m) => m.status === "Hold"), {
        prioritizeActiveSpotlight: false,
      }),
      Deactivated: sortMembers(base.filter((m) => m.status === "Deactivated"), {
        prioritizeActiveSpotlight: false,
      }),
      Cancelled: sortMembers(base.filter((m) => m.status === "Cancelled"), {
        prioritizeActiveSpotlight: false,
      }),
    };
  }, [members, applyFilters, sortMembers]);

  /** Active / Hold / Deactivated with birthday this month — earliest day of month first. */
  const birthdayMembers = useMemo(() => {
    const base = applyFilters(members).filter(
      (m) =>
        BIRTHDAY_ELIGIBLE_STATUSES.has(String(m.status || "").trim()) &&
        isMemberBirthdayThisMonth(m.dob),
    );
    return [...base].sort((a, b) => {
      const byDay = birthdayDayOfMonthSortKey(a.dob) - birthdayDayOfMonthSortKey(b.dob);
      if (byDay !== 0) return byDay;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [members, applyFilters]);

  const sectionListFor = useCallback(
    (key: SectionKey): Member[] => {
      if (key === "Birthday") return birthdayMembers;
      return grouped[key] || [];
    },
    [birthdayMembers, grouped],
  );

  const visiblePhotoPriorityIds = useMemo(() => {
    const ids: string[] = [];
    const keys: SectionKey[] = ["Active", "Birthday", "Hold", "Deactivated", "Cancelled"];
    for (const key of keys) {
      const list = sectionListFor(key);
      const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      const page = pages[key] > totalPages ? 1 : pages[key];
      const start = (page - 1) * PAGE_SIZE;
      for (const m of list.slice(start, start + PAGE_SIZE)) {
        if (m.memberId) ids.push(m.memberId);
      }
    }
    return ids;
  }, [sectionListFor, pages]);

  useMemberPhotoHydration(members, { priorityIds: visiblePhotoPriorityIds });

  const overdueCount = useMemo(
    () => filtered.filter((m) => isPaymentByPastDue(m)).length,
    [filtered],
  );
  const totalCount =
    grouped.Active.length +
    grouped.Hold.length +
    grouped.Deactivated.length +
    grouped.Cancelled.length;

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      pushHistoryCheckpoint(qc, "delete member");
      addMemberDeleteTombstone(id);
      markPendingMemberDelete(id);
      qc.setQueriesData<Member[]>({ queryKey: ["members"] }, (old) =>
        sanitizeMembersForDisplay(Array.isArray(old) ? old : []),
      );
      return permanentDeleteWithOfflineFallback(id);
    },
    onSuccess: async (result, id) => {
      if (result.queued) {
        toast.message("Delete queued — will sync when online");
      } else {
        toast.success("Member deleted");
        clearPendingMemberDelete(id);
      }
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: async (e: Error, id) => {
      removeMemberDeleteTombstone(id);
      clearPendingMemberDelete(id);
      toast.error(e.message);
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      ids,
      status,
      holdDuration,
      amountOverride,
      billingDateOverride,
    }: {
      ids: string[];
      status: string;
      holdDuration?: string;
      amountOverride?: string;
      billingDateOverride?: string;
    }) => {
      pushHistoryCheckpoint(qc, "member status");
      const ts = new Date().toISOString();
      await Promise.all(
        ids.map(async (id) => {
          const current = members.find((m) => m.memberId === id);
          if (!current) return null;
          const patch: Partial<Member> = {
            ...current,
            status,
            ...(status === "Hold"
              ? { holdDuration: holdDuration || settings?.holdDurations?.[0] || "1 Month" }
              : { holdDuration: "" }),
            updatedAt: ts,
          };
          if (amountOverride != null) {
            patch.amount = Number(amountOverride);
          }
          if (billingDateOverride) {
            patch.billingDate = billingDateOverride;
            patch.nextPaymentDate = nextPaymentDateFromBillingDate(billingDateOverride);
            patch.paymentBy = paymentByFromBillingDate(billingDateOverride);
            (patch as { billingDateUpdatedAt?: string }).billingDateUpdatedAt = ts;
          }
          qc.setQueriesData<Member[]>({ queryKey: ["members"] }, (old) =>
            Array.isArray(old)
              ? old.map((row) => (row.memberId === id ? { ...row, ...patch } : row))
              : old,
          );
          return patchMemberWithOfflineFallback(id, patch);
        }),
      );
    },
    onSuccess: async (results) => {
      const queued = Array.isArray(results) && results.some((r) => r && (r as { queued?: boolean }).queued);
      toast.success(queued ? "Status queued — will sync when online" : "Status updated");
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestStatusChange = useCallback(
    (ids: string[], status: string, holdDuration?: string) => {
      if (status !== "Active") {
        statusMutation.mutate({ ids, status, holdDuration });
        return;
      }
      const targets = ids
        .map((id) => members.find((m) => m.memberId === id))
        .filter(Boolean) as Member[];
      const needsFee: Member[] = [];
      const direct: string[] = [];
      for (const m of targets) {
        const from = String(m.status || "").trim().toLowerCase();
        const rule =
          from === "hold" || from === "deactivated" ? getReactivationFeeRule(m) : null;
        if (rule) needsFee.push(m);
        else direct.push(m.memberId);
      }
      if (direct.length) {
        statusMutation.mutate({ ids: direct, status: "Active" });
      }
      if (needsFee.length) {
        const [first, ...rest] = needsFee;
        const rule = getReactivationFeeRule(first)!;
        setFeeQueue(rest.map((m) => m.memberId));
        setReactivationPrompt(buildReactivationFeePrompt(first, "Active", rule));
        if (rest.length) {
          toast.message(
            `${rest.length} more member${rest.length === 1 ? "" : "s"} need reactivation fee after this one.`,
          );
        }
      }
    },
    [members, statusMutation],
  );
  const paymentMutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!paymentFor) return;
      pushHistoryCheckpoint(qc, "payment change");
      const payload = {
        amount: Number(values.amount || 0),
        method: values.method,
        note: values.note,
        paidAt: values.paidAt
          ? new Date(`${values.paidAt}T12:00:00`).toISOString()
          : new Date().toISOString(),
        paidMonth: values.paidMonth,
        recordedBy: user?.name || user?.id || "",
      };
      if (editingPayment?.id) {
        return membersApi.updatePayment(paymentFor.memberId, String(editingPayment.id), payload);
      }
      return membersApi.addPayment(paymentFor.memberId, {
        id: uid("pay"),
        ...payload,
      });
    },
    onSuccess: async () => {
      toast.success(editingPayment ? "Payment updated" : "Payment recorded");
      setPaymentFor(null);
      setEditingPayment(null);
      await qc.invalidateQueries({ queryKey: ["members"] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async ({ memberId, paymentId }: { memberId: string; paymentId: string }) => {
      pushHistoryCheckpoint(qc, "delete payment");
      return membersApi.deletePayment(memberId, paymentId);
    },
    onSuccess: async () => {
      toast.success("Payment deleted");
      await qc.invalidateQueries({ queryKey: ["members"] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payMonthMutation = useMutation({
    mutationFn: async (args: {
      memberId: string;
      monthKey: string;
      amount: number;
      confirmOverride: boolean;
      overrideReason: string;
    }) => {
      pushHistoryCheckpoint(qc, "paid-for-month");
      return membersApi.setPaidForMonth(args.memberId, args.monthKey, {
        amount: args.amount,
        confirmOverride: args.confirmOverride,
        overrideReason: args.overrideReason || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Paid-for-month updated");
      setPayMonthEdit(null);
      await qc.invalidateQueries({ queryKey: ["members"] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (params.get("tab") === "visitors" && hasAccess(user, "members", "viewVisitors")) {
      setTab("visitors");
    }
  }, [params, user]);

  const openCreate = () => {
    setEditing(null);
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
  };

  const gymLabelFor = (gymCodeId?: string | null) => {
    const id = String(gymCodeId || "").trim();
    if (!id) return "";
    const g = gymCodes.find((c) => String(c.id) === id);
    if (!g) return "";
    return g.code
      ? `${g.code}${g.name || g.label ? ` / ${g.name || g.label}` : ""}`
      : String(g.name || g.label || "");
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
      | "success"
      | "birthday" = "reminder",
  ) => {
    openWhatsAppPreview(m, kind);
  };

  const openWhatsAppCall = async (m: Member) => {
    const callUrl = buildWhatsAppCallUrl(m.mobile);
    if (!callUrl) {
      toast.error("Mobile number is missing.");
      return;
    }
    const calledAt = new Date().toISOString();
    const calledBy = String(user?.name || user?.id || "Staff").trim() || "Staff";
    window.open(callUrl, "_blank", "noopener,noreferrer");
    try {
      await membersApi.patch(m.memberId, buildWhatsAppCallMemberPatch(m, { calledAt, calledBy }));
      const event = buildWhatsAppCallSmsEvent(m, { callUrl, calledAt, calledBy });
      void whatsappApi
        .smsEvents()
        .then((existing) => {
          const list = Array.isArray(existing) ? existing : [];
          return whatsappApi.saveSmsEvents([event, ...list].slice(0, 300));
        })
        .catch(() => undefined);
      void logsApi
        .create({
          action: "whatsapp.call.opened",
          entityType: "member",
          entityId: m.memberId,
          meta: {
            memberName: m.name || "",
            calledAt,
            calledBy,
            mobile: formatWhatsAppPhone(m.mobile),
          },
        })
        .catch(() => undefined);
      toast.success("WhatsApp opened for call.");
      await qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record WhatsApp call");
    }
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const prepared = prepareCsvImportRows(text, members, {
        plans: settings?.plans,
        paymentMethods: settings?.paymentMethods,
        staffName: user?.name || user?.id || "",
      });
      if (prepared.fileError) {
        toast.error(prepared.fileError);
        return;
      }
      setCsvImport({
        open: true,
        fileName: file.name || "import.csv",
        rows: prepared.rows,
        summary: prepared.summary,
      });
    } catch {
      toast.error("Failed to read CSV file.");
    }
  };

  const applyCsvImport = async () => {
    const upsertRows = csvImport.rows.filter((r) => r.action === "add" || r.action === "update");
    if (!upsertRows.length) {
      setCsvImport({ open: false, fileName: "", rows: [], summary: { added: 0, updated: 0, skipped: 0 } });
      toast.message("No valid rows to import.");
      return;
    }
    try {
      pushHistoryCheckpoint(qc, "csv import");
      const merged = mergeCsvImportIntoMembers(members, upsertRows);
      // Only send changed/new members to keep payload small.
      const changed = upsertRows
        .map((r) => {
          const id = String(r.member?.memberId || r.matchMemberId || "").trim();
          const byId = merged.find((m) => String(m.memberId || "").trim() === id);
          if (byId) return byId;
          const phone = normalizePhone(r.member?.mobile);
          return merged.find((m) => normalizePhone(m.mobile) === phone);
        })
        .filter(Boolean) as Member[];
      await membersApi.bulk(changed);
      const s = csvImport.summary;
      toast.success(`CSV import done. Added: ${s.added}, Updated: ${s.updated}, Skipped: ${s.skipped}`);
      setCsvImport({ open: false, fileName: "", rows: [], summary: { added: 0, updated: 0, skipped: 0 } });
      await qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CSV import failed");
    }
  };

  const openWelcomeMail = (m: Member) => {
    const result = openGmailWelcome(m, settings?.gmailWelcomeTemplate);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Gmail welcome compose opened");
    const history = Array.isArray(m.messageHistory) ? m.messageHistory : [];
    void membersApi
      .patch(m.memberId, {
        messageHistory: [
          {
            id: `gmail-${Date.now()}`,
            channel: "gmail",
            templateKey: "welcome",
            status: "opened",
            ts: new Date().toISOString(),
          },
          ...history,
        ].slice(0, 50),
      })
      .then(() => qc.invalidateQueries({ queryKey: ["members"] }))
      .catch(() => {});
  };

  const saveQuickField = async (nextValue: string) => {
    if (!quickFieldEdit) return;
    const member = members.find((row) => row.memberId === quickFieldEdit.memberId);
    if (!member) {
      toast.error("Member not found");
      return;
    }
    const key = quickFieldEdit.fieldKey;
    const raw = String(nextValue ?? "").trim();

    if (key === "payMonth") {
      if (!/^\d{4}-\d{2}$/.test(raw)) {
        toast.error("Paid for month must be YYYY-MM");
        return;
      }
      setQuickFieldEdit(null);
      setPayMonthEdit({
        member,
        monthKey: raw,
        amount: Number(member.amount || 0),
      });
      return;
    }

    if (key === "status") {
      setQuickFieldEdit(null);
      requestStatusChange([member.memberId], raw || "Active");
      return;
    }

    const patch: Partial<Member> = {};
    if (key === "name") patch.name = raw;
    else if (key === "mobile") patch.mobile = raw;
    else if (key === "amount") {
      const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Enter a valid amount");
        return;
      }
      patch.amount = n;
    } else if (key === "plan") patch.plan = raw;
    else if (key === "paymentMethod") patch.paymentMethod = raw;
    else if (key === "joiningDate") patch.joiningDate = raw;
    else if (key === "billingDate") {
      patch.billingDate = raw;
      patch.nextPaymentDate = nextPaymentDateFromBillingDate(raw);
      patch.paymentBy = paymentByFromBillingDate(raw);
    } else {
      toast.error("This field is not quick-editable");
      return;
    }

    setQuickFieldSaving(true);
    try {
      pushHistoryCheckpoint(qc, "quick field edit");
      qc.setQueriesData<Member[]>({ queryKey: ["members"] }, (old) =>
        Array.isArray(old)
          ? old.map((row) =>
              row.memberId === member.memberId ? { ...row, ...patch } : row,
            )
          : old,
      );
      const result = await patchMemberWithOfflineFallback(member.memberId, patch);
      if (result.queued) toast.message("Change queued — will sync when online");
      else toast.success(`${quickFieldEdit.label} updated`);
      setQuickFieldEdit(null);
      await qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      await qc.invalidateQueries({ queryKey: ["members"] });
    } finally {
      setQuickFieldSaving(false);
    }
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

  const sectionsToShow = useMemo((): SectionKey[] => {
    if (focusStatus === "Birthday") return ["Birthday"];
    if (focusStatus && STATUS_KEYS.includes(focusStatus as StatusKey)) {
      return [focusStatus as StatusKey];
    }
    // Birthday sits directly under Active Members.
    return ["Active", "Birthday", "Hold", "Deactivated", "Cancelled"];
  }, [focusStatus]);

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
            {offlinePendingCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
                Offline queue: {offlinePendingCount}
              </span>
            ) : null}
            <Button variant="outline" onClick={() => downloadTextFile("members.csv", toCsv(filtered as unknown as Record<string, unknown>[]))}>
              Export CSV
            </Button>
            {hasAccess(user, "members", "addMembers") ? (
              <Button
                className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" /> Add New Member
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-1 flex flex-wrap gap-1.5 rounded-2xl border border-black/[0.06] bg-gradient-to-b from-white/90 to-slate-50/80 p-1.5 dark:border-white/[0.07] dark:from-white/[0.05] dark:to-slate-950/80">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 rounded-xl px-3 text-[12px] font-medium",
            tab === "members"
              ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 dark:hover:text-slate-950"
              : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06]",
          )}
          onClick={() => setTab("members")}
        >
          Members ({totalCount})
        </Button>
        {hasAccess(user, "members", "viewVisitors") ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 rounded-xl px-3 text-[12px] font-medium",
              tab === "visitors"
                ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 dark:hover:text-slate-950"
                : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06]",
            )}
            onClick={() => {
              setTab("visitors");
              void qc.invalidateQueries({ queryKey: ["visitors"] });
            }}
          >
            Visitors ({visitors.length})
          </Button>
        ) : null}
      </div>

      {tab === "visitors" ? (
        <VisitorsPanel visitors={visitors} />
      ) : (
        <>
          <Card className="border-black/[0.06] bg-gradient-to-b from-white/90 to-slate-50/80 shadow-[0_1px_0_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/[0.07] dark:from-white/[0.05] dark:to-slate-950/80 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_16px_40px_-24px_rgba(0,0,0,0.8)]">
            <CardContent className="relative p-2 sm:p-2.5">
              <div className="flex flex-col gap-2 xl:flex-row xl:min-w-0 xl:items-center xl:gap-2 xl:overflow-x-auto xl:whitespace-nowrap xl:[-ms-overflow-style:none] xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
                <div className="flex shrink-0 items-center justify-between gap-2 pl-1.5 xl:justify-start">
                  <div className="flex shrink-0 items-center gap-2">
                    <h2 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                      Members
                    </h2>
                    <span className="rounded-lg bg-slate-900/5 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {totalCount}
                    </span>
                  </div>
                  <div className="relative inline-flex shrink-0 items-center gap-1.5 pr-0.5 xl:hidden">
                    <PaymentQrButton className="!h-8 gap-1 !rounded-xl !border-emerald-500/25 !bg-emerald-500/10 !px-2.5 !text-[11px] !font-medium !text-emerald-800 hover:!bg-emerald-500/15 dark:!border-emerald-400/20 dark:!bg-emerald-400/10 dark:!text-emerald-200" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 rounded-xl border-slate-200/80 bg-white/70 px-2.5 text-[11px] font-medium text-slate-700 shadow-none hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      onClick={() => setActionsOpen((v) => !v)}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Actions
                      {selectedIds.length ? (
                        <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-teal-400 dark:text-slate-950">
                          {selectedIds.length}
                        </span>
                      ) : null}
                    </Button>
                  </div>
                </div>
                <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 dark:bg-white/10 xl:block" aria-hidden />
                <div className="member-status-filters grid w-full grid-cols-3 gap-1.5 lg:grid-cols-6 xl:inline-flex xl:w-auto xl:shrink-0 xl:items-center xl:gap-1">
                  {(
                    [
                      { key: "", label: "All Members", dot: "bg-slate-400 dark:bg-slate-500" },
                      {
                        key: "Active",
                        label: `Active (${grouped.Active.length})`,
                        dot: "bg-emerald-500",
                      },
                      {
                        key: "Birthday",
                        label: `Birthday (${birthdayMembers.length})`,
                        dot: "bg-pink-500",
                      },
                      {
                        key: "Hold",
                        label: `Hold (${grouped.Hold.length})`,
                        dot: "bg-amber-500",
                      },
                      {
                        key: "Deactivated",
                        label: `Deactivated (${grouped.Deactivated.length})`,
                        dot: "bg-rose-500",
                      },
                      {
                        key: "Cancelled",
                        label: `Cancelled (${grouped.Cancelled.length})`,
                        dot: "bg-slate-400",
                      },
                    ] as const
                  ).map((chip) => {
                    const active = (focusStatus || "") === chip.key;
                    return (
                      <button
                        key={chip.key || "all"}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFocusStatus(chip.key)}
                        className={cn(
                          "inline-flex h-8 min-w-0 w-full items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-medium tracking-tight transition-all duration-200 xl:h-9 xl:w-auto xl:shrink-0 xl:justify-start xl:gap-1.5 xl:px-3 xl:text-[12px]",
                          active
                            ? "bg-slate-900 text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.65)] dark:bg-teal-400 dark:text-slate-950 dark:shadow-[0_10px_24px_-12px_rgba(45,212,191,0.55)]"
                            : "border border-slate-200/70 bg-white/70 text-slate-500 hover:bg-black/[0.04] hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 xl:border-transparent xl:bg-transparent",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            chip.dot,
                            active && "ring-2 ring-white/30 dark:ring-slate-950/25",
                          )}
                        />
                        <span className="truncate">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 dark:bg-white/10 xl:block" aria-hidden />
                <div className="relative ml-auto hidden shrink-0 items-center gap-1.5 pr-0.5 xl:inline-flex">
                  <PaymentQrButton className="!h-9 gap-1.5 !rounded-xl !border-emerald-500/25 !bg-emerald-500/10 !px-3 !text-[12px] !font-medium !text-emerald-800 hover:!bg-emerald-500/15 dark:!border-emerald-400/20 dark:!bg-emerald-400/10 dark:!text-emerald-200" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-xl border-slate-200/80 bg-white/70 px-3 text-[12px] font-medium text-slate-700 shadow-none hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                    onClick={() => setActionsOpen((v) => !v)}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    Actions
                    {selectedIds.length ? (
                      <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-teal-400 dark:text-slate-950">
                        {selectedIds.length}
                      </span>
                    ) : null}
                  </Button>
                </div>
                {actionsOpen ? (
                  <div className="absolute right-3 top-[3.25rem] z-30 min-w-[230px] overflow-hidden rounded-2xl border border-black/5 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 xl:right-2 xl:top-11">
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                      onClick={() => {
                        router.push("/finance");
                        setActionsOpen(false);
                      }}
                    >
                      Add Expense
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                      onClick={() => {
                        setActionsOpen(false);
                        if (
                          !hasAccess(user, "members", "addMembers") &&
                          !hasAccess(user, "members", "editMembers")
                        ) {
                          toast.error("CSV import requires Members access.");
                          return;
                        }
                        if (csvInputRef.current) {
                          csvInputRef.current.value = "";
                          csvInputRef.current.click();
                        }
                      }}
                    >
                      Import CSV
                    </button>
                    {selectedIds.length ? (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-white/10" />
                        <button
                          type="button"
                          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                          onClick={() => {
                            requestStatusChange(selectedIds, "Active");
                            setActionsOpen(false);
                          }}
                        >
                          Bulk Activate ({selectedIds.length})
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                          onClick={() => {
                            requestStatusChange(
                              selectedIds,
                              "Hold",
                              settings?.holdDurations?.[0] || "1 Month",
                            );
                            setActionsOpen(false);
                          }}
                        >
                          Bulk Hold ({selectedIds.length})
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
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
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  key: "active" as const,
                  label: "Active Members",
                  value: grouped.Active.length,
                  hint: "View in table →",
                  tone: "emerald" as const,
                  tag: "Live",
                },
                {
                  key: "hold" as const,
                  label: "Hold Members",
                  value: grouped.Hold.length,
                  hint: "View in table →",
                  tone: "amber" as const,
                  tag: "Paused",
                },
                {
                  key: "risk" as const,
                  label: "Risk Alert",
                  value: overdueCount,
                  hint: "Billing overdue →",
                  tone: "orange" as const,
                  tag: "Overdue",
                },
                {
                  key: "winback" as const,
                  label: "Win-Back Opportunity",
                  value: grouped.Deactivated.length,
                  hint: "Deactivated members →",
                  tone: "rose" as const,
                  tag: "Reactivate",
                },
              ] as const
            ).map((card) => (
              <AccentMetricCard
                key={card.key}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
                tag={card.tag}
                onClick={() => setMetricModal(card.key)}
              />
            ))}
          </div>

          {sectionsToShow.map((key) => {
            const list = sectionListFor(key);
            const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            const page = pages[key] > totalPages ? 1 : pages[key];
            const start = (page - 1) * PAGE_SIZE;
            const pageList = list.slice(start, start + PAGE_SIZE);
            const sectionTitle =
              key === "Birthday"
                ? `Birthday Members (${list.length})`
                : `${key} Members (${list.length})`;

            return (
              <div key={key} className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h3
                    className={cn(
                      "inline-flex w-fit items-center gap-2 overflow-hidden rounded-xl border px-3 py-1.5 text-base font-semibold md:text-lg",
                      key === "Active" &&
                        "border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-white text-emerald-900 dark:border-emerald-500/25 dark:from-emerald-950/40 dark:to-slate-950 dark:text-emerald-100",
                      key === "Birthday" &&
                        "border-pink-200/80 bg-gradient-to-r from-pink-50 to-white text-pink-900 dark:border-pink-500/25 dark:from-pink-950/40 dark:to-slate-950 dark:text-pink-100",
                      key === "Hold" &&
                        "border-amber-200/80 bg-gradient-to-r from-amber-50 to-white text-amber-900 dark:border-amber-500/25 dark:from-amber-950/40 dark:to-slate-950 dark:text-amber-100",
                      key === "Deactivated" &&
                        "border-rose-200/80 bg-gradient-to-r from-rose-50 to-white text-rose-900 dark:border-rose-500/25 dark:from-rose-950/40 dark:to-slate-950 dark:text-rose-100",
                      key === "Cancelled" &&
                        "border-slate-200/80 bg-gradient-to-r from-slate-50 to-white text-slate-800 dark:border-white/10 dark:from-slate-900/70 dark:to-slate-950 dark:text-slate-100",
                    )}
                  >
                    <span
                      className={cn(
                        "h-4 w-1 shrink-0 rounded-full",
                        key === "Active" && "bg-emerald-500",
                        key === "Birthday" && "bg-pink-500",
                        key === "Hold" && "bg-amber-500",
                        key === "Deactivated" && "bg-rose-500",
                        key === "Cancelled" && "bg-slate-400 dark:bg-slate-500",
                      )}
                    />
                    {sectionTitle}
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
                            className={quickSearchInput.trim() ? "pr-16" : "pr-10"}
                          />
                          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                            {quickSearchInput.trim() ? (
                              <button
                                type="button"
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={() => {
                                  setQuickSearchInput("");
                                  setAppliedQuickSearch("");
                                }}
                                aria-label="Clear search"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setAppliedQuickSearch(quickSearchInput.trim())}
                              aria-label="Search"
                            >
                              <Search className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={openFilterPanel}
                          aria-pressed={anyFilterActive}
                          className={cn(
                            "relative h-9 gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-all duration-200",
                            anyFilterActive
                              ? "bg-slate-900 text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.65)] hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:shadow-[0_10px_24px_-12px_rgba(45,212,191,0.55)] dark:hover:bg-teal-300"
                              : "border border-slate-200/80 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]",
                          )}
                        >
                          <Filter className="h-3.5 w-3.5" />
                          {anyFilterActive ? "Filter applied" : "Filter"}
                          {anyFilterActive ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums dark:bg-slate-950/20">
                              {activeFilterCount}
                            </span>
                          ) : null}
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
                                  messageOpts={messageOpts}
                                  onToggleSelect={() => toggleSelect(m.memberId)}
                                  onToggleExpand={() =>
                                    setExpandedId((prev) => (prev === m.memberId ? null : m.memberId))
                                  }
                                  onEdit={() => openEdit(m)}
                                  onWhatsApp={(kind) => openWhatsApp(m, kind)}
                                  onPhotoClick={() => setPhotoPreviewMember(m)}
                                />
                                {expanded ? (
                                  <div className="rounded-xl border border-border/70 bg-slate-50/80 px-3 py-3 dark:bg-slate-900/40">
                                    <MemberExpandedDetails
                                      m={m}
                                      allMembers={members}
                                      isOwner={isOwner}
                                      canEdit={hasAccess(user, "members", "editMembers")}
                                      canDelete={
                                        hasAccess(user, "members", "deleteMembers") || isOwner
                                      }
                                      holdOptions={
                                        settings?.holdDurations || ["1 Month", "2 Months", "3 Months"]
                                      }
                                      planOptions={settings?.plans || []}
                                      statusOptions={settings?.statuses || [...STATUS_KEYS]}
                                      paymentOptions={settings?.paymentMethods || []}
                                      messageOpts={messageOpts}
                                      onEdit={() => openEdit(m)}
                                      onAddPayment={() => {
                                        setEditingPayment(null);
                                        setPaymentFor(m);
                                      }}
                                      onEditPayment={(payment) => {
                                        setEditingPayment(payment);
                                        setPaymentFor(m);
                                      }}
                                      onDeletePayment={(payment) => {
                                        if (!payment.id) return;
                                        if (
                                          !isMasterOwnerUser(user) &&
                                          String(user?.id || "").toLowerCase() !== "owner"
                                        ) {
                                          toast.error("Only owner can delete payments");
                                          return;
                                        }
                                        if (
                                          confirm(
                                            `Delete payment of ${formatCurrency(Number(payment.amount || 0))}?`,
                                          )
                                        ) {
                                          deletePaymentMutation.mutate({
                                            memberId: m.memberId,
                                            paymentId: String(payment.id),
                                          });
                                        }
                                      }}
                                      onEditPayMonth={(monthKey) => {
                                        setPayMonthEdit({
                                          member: m,
                                          monthKey,
                                          amount: Number(m.amount || 0),
                                        });
                                      }}
                                      onWhatsApp={(kind) => openWhatsApp(m, kind)}
                                      onWhatsAppCall={() => void openWhatsAppCall(m)}
                                      onWelcomeMail={() => openWelcomeMail(m)}
                                      onUploadDocument={(file) => void uploadMemberDocument(m, file)}
                                      onDelete={() => {
                                        if (confirm(`Delete ${m.name || m.memberId}?`)) {
                                          deleteMutation.mutate(m.memberId);
                                        }
                                      }}
                                      onStatusChange={(status, holdDuration) => {
                                        requestStatusChange([m.memberId], status, holdDuration);
                                      }}
                                      onQuickFieldEdit={(payload) => setQuickFieldEdit(payload)}
                                      onNavigateMember={(other) => {
                                        setExpandedId(other.memberId);
                                        setAppliedQuickSearch(other.memberId);
                                        setQuickSearchInput(other.memberId);
                                      }}
                                      onUnlinkFamilyGroup={(groupId) => {
                                        if (
                                          !confirm(
                                            "Remove family link for everyone in this group?",
                                          )
                                        ) {
                                          return;
                                        }
                                        const peers = members.filter(
                                          (row) =>
                                            String(row.familyGroupId || row.family_group_id || "").trim() ===
                                            groupId,
                                        );
                                        void Promise.all(
                                          peers.map((peer) =>
                                            membersApi.patch(peer.memberId, {
                                              familyGroupId: "",
                                              familyPrimaryMemberId: "",
                                            }),
                                          ),
                                        )
                                          .then(async () => {
                                            toast.success("Family link removed");
                                            await qc.invalidateQueries({ queryKey: ["members"] });
                                          })
                                          .catch((e: Error) =>
                                            toast.error(e.message || "Could not unlink family"),
                                          );
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </Fragment>
                            );
                          })}
                          {!pageList.length ? (
                            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-[11px] text-muted-foreground">
                              {key === "Birthday"
                                ? "No Active, Hold, or Deactivated members have a birthday this month."
                                : `No ${key.toLowerCase()} members match your filters.`}
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
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-filters-title"
          >
            <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="member-filters-title" className="text-lg font-semibold tracking-tight">
                    Member filters
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set criteria, then Save filter. Applied filters stay highlighted on the list.
                  </p>
                </div>
                {anyFilterActive ? (
                  <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-teal-400 dark:text-slate-950">
                    {activeFilterCount} applied
                  </span>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <div>
                <Label>Plan</Label>
                <Select
                  className="mt-1"
                  value={draftFilters.plan}
                  onChange={(e) => setDraftFilters({ ...draftFilters, plan: e.target.value })}
                >
                  <option value="">All plans</option>
                  {(settings?.plans || []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  className="mt-1"
                  value={draftFilters.status}
                  onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}
                >
                  <option value="">All statuses</option>
                  {(settings?.statuses || STATUS_KEYS).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Payment method</Label>
                <Select
                  className="mt-1"
                  value={draftFilters.paymentMethod}
                  onChange={(e) =>
                    setDraftFilters({ ...draftFilters, paymentMethod: e.target.value })
                  }
                >
                  <option value="">All methods</option>
                  {(settings?.paymentMethods || []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Billing month</Label>
                <Input
                  className="mt-1"
                  type="month"
                  value={draftFilters.billingMonth}
                  onChange={(e) =>
                    setDraftFilters({ ...draftFilters, billingMonth: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Joined from</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={draftFilters.joinFrom}
                  onChange={(e) => setDraftFilters({ ...draftFilters, joinFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>Joined to</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={draftFilters.joinTo}
                  onChange={(e) => setDraftFilters({ ...draftFilters, joinTo: e.target.value })}
                />
              </div>
              <div>
                <Label>Bill from</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={draftFilters.billFrom}
                  onChange={(e) => setDraftFilters({ ...draftFilters, billFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>Bill to</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={draftFilters.billTo}
                  onChange={(e) => setDraftFilters({ ...draftFilters, billTo: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <Button
                type="button"
                variant="ghost"
                className="text-slate-600 dark:text-slate-300"
                onClick={clearDraftFilters}
              >
                Reset form
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={clearAndSaveFilters}
                >
                  Clear saved
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFilterOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
                  onClick={saveFilters}
                >
                  Save filter
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MemberMetricModal
        open={metricModal}
        members={filtered}
        onClose={() => setMetricModal("")}
        onSelectMember={(m) => {
          setMetricModal("");
          openEdit(m);
        }}
      />

      {editing && hasAccess(user, "members", "editMembers") ? (
        <EditMemberModal
          key={editing.memberId}
          member={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ["members"] });
          }}
          settings={settings}
          gymCodes={gymCodes}
          currentUser={user}
          planOptions={settings?.plans}
          statusOptions={settings?.statuses || [...STATUS_KEYS]}
          holdOptions={settings?.holdDurations}
          paymentOptions={settings?.paymentMethods}
        />
      ) : null}

      <PaymentEntryModal
        open={Boolean(paymentFor)}
        member={paymentFor}
        payment={editingPayment}
        methods={settings?.paymentMethods || ["Cash", "UPI", "Card", "Bank"]}
        saving={paymentMutation.isPending}
        onClose={() => {
          setPaymentFor(null);
          setEditingPayment(null);
        }}
        onSave={async (values) => {
          await paymentMutation.mutateAsync(values);
        }}
      />

      <PaidForMonthOverrideDialog
        open={Boolean(payMonthEdit)}
        monthKey={payMonthEdit?.monthKey || formatMonthKey()}
        currentAmount={
          payMonthEdit
            ? Number(
                (Array.isArray(payMonthEdit.member.paymentHistory)
                  ? payMonthEdit.member.paymentHistory
                  : []
                ).find(
                  (p) =>
                    String(p.paidMonth || p.paid_month || "") === payMonthEdit.monthKey,
                )?.amount ?? payMonthEdit.member.amount,
              )
            : undefined
        }
        nextAmount={payMonthEdit?.amount || 0}
        saving={payMonthMutation.isPending}
        onClose={() => setPayMonthEdit(null)}
        onConfirm={async (payload) => {
          if (!payMonthEdit) return;
          await payMonthMutation.mutateAsync({
            memberId: payMonthEdit.member.memberId,
            monthKey: payMonthEdit.monthKey,
            amount: payload.amount,
            confirmOverride: payload.confirmOverride,
            overrideReason: payload.overrideReason,
          });
        }}
      />

      <MessagePreviewModal
        preview={waPreview}
        sending={waSending}
        onClose={closeWhatsAppPreview}
        onSend={() => void confirmWhatsAppSend()}
      />

      <MemberPhotoPreviewModal
        open={Boolean(photoPreviewMember)}
        onClose={() => setPhotoPreviewMember(null)}
        member={photoPreviewMember}
        gymLabel={gymLabelFor(
          photoPreviewMember?.assignedGymCodeId || photoPreviewMember?.assigned_gym_code_id,
        )}
      />

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          void handleCsvFile(file);
        }}
      />

      <CsvImportModal
        open={csvImport.open}
        fileName={csvImport.fileName}
        rows={csvImport.rows}
        summary={csvImport.summary}
        onClose={() =>
          setCsvImport({
            open: false,
            fileName: "",
            rows: [],
            summary: { added: 0, updated: 0, skipped: 0 },
          })
        }
        onConfirm={() => void applyCsvImport()}
      />

      <ReactivationFeeModal
        prompt={reactivationPrompt}
        saving={statusMutation.isPending}
        onClose={() => {
          setReactivationPrompt(null);
          setFeeQueue([]);
        }}
        onConfirm={async (values) => {
          await statusMutation.mutateAsync({
            ids: [values.memberId],
            status: values.nextStatus || "Active",
            amountOverride: values.amount,
            billingDateOverride: values.billingDate,
          });
          setReactivationPrompt(null);
          if (feeQueue.length) {
            const [nextId, ...rest] = feeQueue;
            setFeeQueue(rest);
            const nextMember = members.find((row) => row.memberId === nextId);
            const rule = nextMember ? getReactivationFeeRule(nextMember) : null;
            if (nextMember && rule) {
              setReactivationPrompt(buildReactivationFeePrompt(nextMember, "Active", rule));
            }
          }
        }}
      />

      <QuickFieldEditModal
        edit={quickFieldEdit}
        saving={quickFieldSaving}
        onClose={() => setQuickFieldEdit(null)}
        onSave={(value) => void saveQuickField(value)}
      />
    </div>
  );
}
