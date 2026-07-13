"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPaymentByPastDue, paymentByDateKey } from "@/lib/domain/billing";
import { formatDate, cn } from "@/lib/utils";
import type { Member } from "@/types";

export type MetricModalKey =
  | "active"
  | "hold"
  | "deactivated"
  | "cancelled"
  | "risk"
  | "winback";

type SortField =
  | "memberId"
  | "name"
  | "mobile"
  | "plan"
  | "billingDate"
  | "paymentBy"
  | "status";

const PAGE_SIZE = 20;

const META: Record<
  MetricModalKey,
  { title: string; hint: string; tone: string; shell: string; headerBg: string }
> = {
  active: {
    title: "Active Members",
    hint: "Currently active memberships",
    tone: "text-emerald-800 dark:text-emerald-300",
    shell: "border-emerald-200 dark:border-emerald-800",
    headerBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  hold: {
    title: "Hold Members",
    hint: "Members currently on hold",
    tone: "text-amber-800 dark:text-amber-300",
    shell: "border-amber-200 dark:border-amber-800",
    headerBg: "bg-amber-50 dark:bg-amber-950/40",
  },
  deactivated: {
    title: "Deactivated Members",
    hint: "Deactivated memberships",
    tone: "text-rose-800 dark:text-rose-300",
    shell: "border-rose-200 dark:border-rose-800",
    headerBg: "bg-rose-50 dark:bg-rose-950/40",
  },
  cancelled: {
    title: "Cancelled Members",
    hint: "Cancelled memberships",
    tone: "text-slate-800 dark:text-slate-300",
    shell: "border-slate-200 dark:border-slate-700",
    headerBg: "bg-slate-100 dark:bg-slate-900/60",
  },
  risk: {
    title: "Risk Alert",
    hint: "Billing overdue members",
    tone: "text-orange-800 dark:text-orange-300",
    shell: "border-orange-200 dark:border-orange-800",
    headerBg: "bg-orange-50 dark:bg-orange-950/40",
  },
  winback: {
    title: "Win-back Opportunity",
    hint: "Deactivated members to re-engage",
    tone: "text-rose-800 dark:text-rose-300",
    shell: "border-rose-200 dark:border-rose-800",
    headerBg: "bg-rose-50 dark:bg-rose-950/40",
  },
};

function paymentByDisplay(m: Member) {
  return paymentByDateKey(m) || m.billingDate || "";
}

function statusBadgeVariant(status?: string) {
  if (status === "Active") return "success" as const;
  if (status === "Hold") return "warning" as const;
  if (status === "Deactivated") return "danger" as const;
  return "muted" as const;
}

function filterByMetric(members: Member[], key: MetricModalKey) {
  if (key === "active") return members.filter((m) => m.status === "Active");
  if (key === "hold") return members.filter((m) => m.status === "Hold");
  if (key === "deactivated" || key === "winback") {
    return members.filter((m) => m.status === "Deactivated");
  }
  if (key === "cancelled") return members.filter((m) => m.status === "Cancelled");
  if (key === "risk") return members.filter((m) => isPaymentByPastDue(m));
  return members;
}

function matchesSearch(m: Member, q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hay = [
    m.memberId,
    m.name,
    m.mobile,
    m.email,
    m.plan,
    m.status,
    m.staff,
    m.trainerId,
    m.paymentMethod,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

function sortValue(m: Member, field: SortField) {
  if (field === "paymentBy") return paymentByDisplay(m) || "";
  if (field === "billingDate") return m.billingDate || "";
  if (field === "memberId") return m.memberId || "";
  if (field === "name") return m.name || "";
  if (field === "mobile") return m.mobile || "";
  if (field === "plan") return m.plan || "";
  if (field === "status") return m.status || "";
  return "";
}

/** Map dashboard status tile keys (Active/Hold/…) to modal variants. */
export function statusTileToMetricKey(
  status: "Active" | "Hold" | "Deactivated" | "Cancelled",
): MetricModalKey {
  if (status === "Active") return "active";
  if (status === "Hold") return "hold";
  if (status === "Deactivated") return "deactivated";
  return "cancelled";
}

type MemberMetricModalProps = {
  open: MetricModalKey | "";
  members: Member[];
  onClose: () => void;
  onSelectMember: (member: Member) => void;
  /** Optional initial search when opening from dashboard search. */
  initialSearch?: string;
};

export function MemberMetricModal({
  open,
  members,
  onClose,
  onSelectMember,
  initialSearch = "",
}: MemberMetricModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    setSearchInput(initialSearch);
    setAppliedSearch(initialSearch.trim());
    setSortField("name");
    setSortDirection("asc");
    setPage(1);
  }, [open, initialSearch]);

  const filtered = useMemo(() => {
    if (!open) return [];
    let list = filterByMetric(members, open);
    if (appliedSearch.trim()) {
      list = list.filter((m) => matchesSearch(m, appliedSearch));
    }
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = String(sortValue(a, sortField)).toLowerCase();
      const bv = String(sortValue(b, sortField)).toLowerCase();
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * dir;
    });
  }, [open, members, appliedSearch, sortField, sortDirection]);

  if (!open) return null;

  const meta = META[open];
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = page > totalPages ? 1 : page;
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = totalCount === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + PAGE_SIZE, totalCount);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const pageNums = (() => {
    if (totalPages <= 1) return [] as number[];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums: number[] = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  })();

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apg-metric-modal-title"
    >
      <div
        className={cn(
          "flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border bg-background shadow-xl",
          meta.shell,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn("flex items-start justify-between gap-3 border-b px-5 py-4", meta.headerBg)}>
          <div>
            <h3 id="apg-metric-modal-title" className={cn("text-lg font-semibold", meta.tone)}>
              {meta.title}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {meta.hint} · {totalCount} member{totalCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <div className="relative min-w-[200px] max-w-md flex-1">
            <Input
              value={searchInput}
              onChange={(e) => {
                const next = e.target.value;
                setSearchInput(next);
                if (!next.trim()) {
                  setAppliedSearch("");
                  setPage(1);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="Search by name, ID, phone, plan…"
              className="pr-10"
            />
            <button
              type="button"
              onClick={applySearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-muted-foreground hover:text-foreground"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
          {appliedSearch ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setAppliedSearch("");
                setPage(1);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear search
            </button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-3">
          <div className={cn("min-h-0 flex-1 overflow-auto rounded-2xl border", meta.shell)}>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className={cn("border-b text-left text-xs", meta.headerBg, meta.tone)}>
                  {(
                    [
                      ["memberId", "ID"],
                      ["name", "Name"],
                      ["mobile", "Mobile"],
                      ["plan", "Plan"],
                      ["billingDate", "Bill Date"],
                      ["paymentBy", "Payment By"],
                      ["status", "Status"],
                    ] as const
                  ).map(([field, label]) => (
                    <th key={field} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort(field)}
                        className="font-semibold transition-colors hover:underline"
                      >
                        {label}{" "}
                        <span className="text-[11px] opacity-70">{sortIndicator(field)}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((m, rowIdx) => (
                  <tr
                    key={m.memberId}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]",
                      rowIdx % 2 === 1 && "bg-muted/20",
                    )}
                    onClick={() => onSelectMember(m)}
                  >
                    <td className="px-4 py-3 font-medium">{m.memberId}</td>
                    <td className="px-4 py-3">{m.name || "—"}</td>
                    <td className="px-4 py-3">{m.mobile || "—"}</td>
                    <td className="px-4 py-3">{m.plan || "—"}</td>
                    <td className="px-4 py-3">{formatDate(m.billingDate)}</td>
                    <td className="px-4 py-3">{formatDate(paymentByDisplay(m))}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(String(m.status))}>
                        {m.status || "Active"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!pageRows.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No members match this list
                      {appliedSearch ? ` for “${appliedSearch}”` : ""}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs text-muted-foreground">
            <span>
              Showing {showingFrom}–{showingTo} of {totalCount}
            </span>
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                {pageNums.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === safePage ? "default" : "outline"}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
