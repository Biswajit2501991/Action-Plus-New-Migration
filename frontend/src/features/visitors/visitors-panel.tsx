"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  VisitorFormModal,
  type VisitorFormValues,
} from "@/features/visitors/visitor-form-modal";
import { VisitorIntakeQrCard } from "@/features/visitors/visitor-intake-qr-card";
import { hasAccess } from "@/lib/domain/permissions";
import { isRecordNewWithinHours } from "@/lib/domain/new-record";
import { isQrVisitorIntakeEnabled } from "@/lib/domain/attendance";
import { cn, formatDate, uid } from "@/lib/utils";
import { visitorsApi } from "@/services/api";
import { useAuthStore, useUiStore } from "@/stores";
import { useSettings } from "@/hooks/use-data";
import type { Visitor } from "@/types";

function displayName(v: Visitor) {
  return String(v.fullName || v.name || "Visitor").trim();
}

function NewVisitorBadge({ timestamp }: { timestamp?: string | null }) {
  if (!isRecordNewWithinHours(timestamp, 48)) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-[#EF4444] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      New
    </span>
  );
}

type Props = {
  visitors: Visitor[];
};

export function VisitorsPanel({ visitors }: Props) {
  const user = useAuthStore((s) => s.user);
  const openConvertVisitor = useUiStore((s) => s.openConvertVisitor);
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const qrVisitorEnabled = isQrVisitorIntakeEnabled(settings as Record<string, unknown>);
  const canWrite =
    hasAccess(user, "members", "addMembers") || hasAccess(user, "members", "editMembers");
  const canDelete =
    hasAccess(user, "members", "deleteMembers") || hasAccess(user, "members", "editMembers");
  const canConvert = hasAccess(user, "members", "addMembers");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Visitor | null>(null);
  const [expandedId, setExpandedId] = useState("");

  const sorted = useMemo(() => {
    return [...visitors].sort((a, b) => {
      const aMs = new Date(String(a.addedAt || a.visitDate || 0)).getTime() || 0;
      const bMs = new Date(String(b.addedAt || b.visitDate || 0)).getTime() || 0;
      return bMs - aMs;
    });
  }, [visitors]);

  const save = useMutation({
    mutationFn: async (values: VisitorFormValues) => {
      const id = values.id || uid("V");
      const now = new Date().toISOString();
      const next: Visitor = {
        id,
        fullName: values.fullName.trim(),
        name: values.fullName.trim(),
        email: values.email.trim(),
        dob: values.dob,
        mobile: values.mobile.trim(),
        gender: values.gender,
        callBackRequired: values.callBackRequired,
        tentativeJoiningDate: values.tentativeJoiningDate,
        status: values.status || "New",
        addedAt: values.addedAt || now,
        visitDate: values.addedAt || now,
        assignedGymCodeId:
          values.assignedGymCodeId ||
          String(user?.activeBranchId || user?.gymCodeId || ""),
        updatedAt: now,
        lastCalledAt: editing?.lastCalledAt,
        lastCalledBy: editing?.lastCalledBy,
      };
      const rest = visitors.filter((v) => v.id !== id);
      return visitorsApi.bulk([next, ...rest]);
    },
    onSuccess: async () => {
      toast.success(editing ? "Visitor updated" : "Visitor added");
      setFormOpen(false);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markCalled = useMutation({
    mutationFn: async (visitor: Visitor) => {
      const next: Visitor = {
        ...visitor,
        lastCalledAt: new Date().toISOString(),
        lastCalledBy: String(user?.name || user?.id || ""),
        updatedAt: new Date().toISOString(),
      };
      const rest = visitors.filter((v) => v.id !== visitor.id);
      return visitorsApi.bulk([next, ...rest]);
    },
    onSuccess: async () => {
      toast.success("Marked as called");
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => visitorsApi.remove(id),
    onSuccess: async () => {
      toast.success("Visitor removed");
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card className="overflow-hidden border-slate-200/90 shadow-sm dark:border-white/10">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Enquiries
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Visitors
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {sorted.length} on file · follow-ups and walk-ins
              </p>
            </div>
            {canWrite ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
              >
                <Plus className="h-4 w-4" />
                Add visitor
              </Button>
            ) : null}
          </div>

          {canWrite && qrVisitorEnabled ? <VisitorIntakeQrCard /> : null}

          {!sorted.length ? (
            <EmptyState title="No visitors yet" description="Add a walk-in or phone enquiry." />
          ) : (
            <div className="space-y-2">
              {sorted.map((v) => {
                const expanded = expandedId === v.id;
                const converted = String(v.status || "") === "Converted";
                const isNew = isRecordNewWithinHours(String(v.addedAt || v.visitDate || ""), 48);
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "rounded-2xl border transition",
                      isNew
                        ? "border-rose-300/90 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-950/25"
                        : "border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.02]",
                      expanded && "ring-1 ring-slate-300 dark:ring-white/15",
                      converted && "opacity-80",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setExpandedId(expanded ? "" : v.id)}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          isNew
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200"
                            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
                        )}
                      >
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
                            {displayName(v)}
                          </p>
                          <NewVisitorBadge timestamp={String(v.addedAt || v.visitDate || "")} />
                          {String(v.intakeSource || "") === "qr_public" ? (
                            <Badge variant="muted">QR</Badge>
                          ) : null}
                          {(() => {
                            const status = String(v.status || "New").trim() || "New";
                            if (status.toLowerCase() === "new") return null;
                            return (
                              <Badge variant={converted ? "success" : v.callBackRequired ? "warning" : "muted"}>
                                {status}
                              </Badge>
                            );
                          })()}
                          {v.callBackRequired && !converted ? (
                            <Badge variant="warning">Callback</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {v.mobile || "—"} · {v.email || "—"} · added{" "}
                          {formatDate(String(v.addedAt || v.visitDate || ""))}
                        </p>
                      </div>
                    </button>
                    {expanded ? (
                      <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-white/10">
                        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                          <p>
                            <span className="text-slate-400">Gender · </span>
                            {v.gender || "—"}
                          </p>
                          <p>
                            <span className="text-slate-400">DOB · </span>
                            {formatDate(String(v.dob || ""))}
                          </p>
                          <p>
                            <span className="text-slate-400">Tentative join · </span>
                            {formatDate(String(v.tentativeJoiningDate || ""))}
                          </p>
                          <p>
                            <span className="text-slate-400">Last called · </span>
                            {v.lastCalledAt
                              ? `${formatDate(String(v.lastCalledAt))} by ${v.lastCalledBy || "—"}`
                              : "Not yet"}
                          </p>
                          {converted ? (
                            <p className="sm:col-span-2">
                              <span className="text-slate-400">Converted member · </span>
                              {String(v.convertedMemberId || "—")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canWrite && !converted ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(v);
                                setFormOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {canWrite && !converted ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markCalled.isPending}
                              onClick={() => markCalled.mutate(v)}
                            >
                              <Phone className="h-3.5 w-3.5" />
                              Mark called
                            </Button>
                          ) : null}
                          {canConvert ? (
                            <Button
                              size="sm"
                              disabled={converted}
                              className={cn(
                                converted
                                  ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
                                  : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
                              )}
                              onClick={() => {
                                if (converted) return;
                                openConvertVisitor(v);
                              }}
                            >
                              Convert to Member
                            </Button>
                          ) : null}
                          {canDelete && !converted ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (confirm(`Remove visitor ${displayName(v)}?`)) {
                                  remove.mutate(v.id);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <VisitorFormModal
        open={formOpen}
        visitor={editing}
        branchId={String(user?.activeBranchId || user?.gymCodeId || "")}
        saving={save.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={async (values) => {
          await save.mutateAsync(values);
        }}
      />
    </>
  );
}
