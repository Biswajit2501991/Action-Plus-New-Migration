"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMembers, useWhatsapp } from "@/hooks/use-data";
import { useAuthStore } from "@/stores";
import { hasAccess } from "@/lib/domain/permissions";
import {
  getSmsSentInfoText,
  primaryMessageActionForMember,
} from "@/lib/domain/member-actions";
import { paymentByDateKey } from "@/lib/domain/billing";
import { nextPaymentDateFromBillingDate } from "@/lib/domain/member-dates";
import {
  membersByWhatsAppType,
  suggestionToneClasses,
  smsTypeLabel,
} from "@/lib/domain/whatsapp";
import {
  WHATSAPP_TEMPLATE_KEYS,
  WHATSAPP_TYPE_META,
  type WhatsAppTemplateKey,
} from "@/lib/domain/whatsapp-templates";
import { cn, formatDate } from "@/lib/utils";
import { MessagePreviewModal } from "@/features/whatsapp/message-preview-modal";
import { WhatsappTemplatesPanel } from "@/features/whatsapp/whatsapp-templates-panel";
import { useWhatsappSend } from "@/features/whatsapp/use-whatsapp-send";

const PAGE_SIZE = 10;

const TAB_PERMISSION: Record<WhatsAppTemplateKey | "templates", string> = {
  reminder: "viewReminder",
  monthReminder: "viewMonthReminder",
  success: "viewSuccess",
  fine: "viewFine",
  deactivate: "viewDeactivate",
  hold: "viewHold",
  welcome: "viewWelcome",
  templates: "viewTemplates",
};

export function WhatsappPage() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.id === "owner" || String(user?.staffRole || user?.role || "").toLowerCase() === "owner";
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: whatsappData, isLoading: waLoading } = useWhatsapp();
  const { templates, preview, sending, openPreview, closePreview, confirmSend } = useWhatsappSend();

  const allowedTabs = useMemo(
    () =>
      WHATSAPP_TYPE_META.filter((tab) =>
        hasAccess(user, "whatsapp", TAB_PERMISSION[tab.key]),
      ),
    [user],
  );

  const [activeType, setActiveType] = useState<WhatsAppTemplateKey | "templates">("reminder");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  useEffect(() => {
    if (!allowedTabs.length) return;
    if (!allowedTabs.some((t) => t.key === activeType)) {
      setActiveType(allowedTabs[0].key);
    }
  }, [allowedTabs, activeType]);

  const byType = useMemo(
    () => membersByWhatsAppType(members, { isOwner }),
    [members, isOwner],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const key of WHATSAPP_TEMPLATE_KEYS) map[key] = byType[key]?.length || 0;
    map.templates = WHATSAPP_TEMPLATE_KEYS.length;
    return map;
  }, [byType]);

  const rows = useMemo(() => {
    if (activeType === "templates") return [];
    const q = search.toLowerCase().trim();
    const base = byType[activeType] || [];
    return base.filter((m) => {
      if (!q) return true;
      const hay = `${m.name || ""} ${m.mobile || ""} ${m.memberId || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [byType, activeType, search]);

  useEffect(() => {
    setPage(1);
  }, [activeType, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = page > totalPages ? 1 : page;
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isSuccessAudit = activeType === "success";
  const canActSuccess = !isSuccessAudit || isOwner;

  const events = (Array.isArray(whatsappData?.events) ? whatsappData.events : []) as Record<
    string,
    unknown
  >[];
  const activityRows = useMemo(
    () =>
      [...events].sort((a, b) => {
        const at = new Date(String(a?.ts || a?.createdAt || 0)).getTime();
        const bt = new Date(String(b?.ts || b?.createdAt || 0)).getTime();
        return bt - at;
      }),
    [events],
  );
  const activityTotalPages = Math.max(1, Math.ceil(activityRows.length / PAGE_SIZE));
  const safeActivityPage = activityPage > activityTotalPages ? 1 : activityPage;
  const activityPageRows = activityRows.slice(
    (safeActivityPage - 1) * PAGE_SIZE,
    safeActivityPage * PAGE_SIZE,
  );

  if (membersLoading || waLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="WhatsApp / SMS"
        description="Messaging Center — preview branch templates, then open WhatsApp with send tracking."
      />

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-1.5 rounded-2xl border border-border/60 bg-card/40 p-1.5 backdrop-blur-sm dark:border-white/5 dark:bg-slate-950/50">
          {allowedTabs.map((tab) => {
            const active = activeType === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveType(tab.key)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-white text-slate-900 shadow-md ring-1 ring-black/5 dark:bg-teal-400 dark:text-slate-950 dark:ring-teal-300/30"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "ml-1.5 tabular-nums text-[10px]",
                    active ? "opacity-70" : "opacity-50",
                  )}
                >
                  ({counts[tab.key] || 0})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!allowedTabs.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No WhatsApp message types are enabled for your account.
          </CardContent>
        </Card>
      ) : activeType === "templates" ? (
        <WhatsappTemplatesPanel
          systemTemplates={templates}
          onOpenMessagingCenter={() => setActiveType("reminder")}
          onPreviewSystem={(key) => {
            const sample =
              members.find((m) => (m.status || "Active") === "Active") || members[0];
            if (sample) openPreview(sample, key);
          }}
        />
      ) : (
        <Card className="overflow-hidden border-slate-200/80 bg-white/80 shadow-sm backdrop-blur dark:border-white/5 dark:bg-slate-950/60 dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.8)]">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                  Messaging Center
                </h2>
                <p className="max-w-2xl text-xs text-slate-500 dark:text-slate-400">
                  {isSuccessAudit
                    ? "Success SMS audit — members with a recorded Success send. Owner can resend."
                    : `Who to send ${smsTypeLabel(activeType)} to. Preview opens before WhatsApp.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name / mobile"
                    className="h-9 w-[200px] border-slate-200 bg-white pl-8 text-sm dark:border-white/10 dark:bg-slate-900/80"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/8 dark:bg-slate-950/40">
              <table className="min-w-full hidden text-sm md:table">
                <thead>
                  <tr className="bg-sky-50 text-sky-800 dark:bg-teal-500/10 dark:text-teal-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Member</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Mobile</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Next Payment</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Payment By</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Suggested</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((m) => {
                    const suggested = primaryMessageActionForMember(m, { isOwner });
                    const paymentBy = paymentByDateKey(m) || m.billingDate || "";
                    const nextPay =
                      m.nextPaymentDate || nextPaymentDateFromBillingDate(m.billingDate);
                    const canSendSuggested =
                      Boolean(String(m.mobile || "").trim()) &&
                      !suggested.disabled &&
                      canActSuccess &&
                      suggested.key !== "none";
                    return (
                      <tr
                        key={`${activeType}-${m.memberId}`}
                        className="border-t border-slate-100 dark:border-border"
                      >
                        <td className="px-3 py-2.5 font-medium">{m.name || m.memberId}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-muted-foreground">
                          {m.mobile || "—"}
                        </td>
                        <td className="px-3 py-2.5">{m.status || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(nextPay)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(paymentBy)}</td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            disabled={!canSendSuggested}
                            onClick={() =>
                              openPreview(
                                m,
                                isSuccessAudit
                                  ? "success"
                                  : suggested.key === "none"
                                    ? activeType
                                    : suggested.key,
                              )
                            }
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
                              canSendSuggested
                                ? suggestionToneClasses(
                                    isSuccessAudit ? "success" : suggested.key,
                                  )
                                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                            )}
                          >
                            {isSuccessAudit ? "Success SMS Sent" : suggested.label || "—"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canActSuccess || !m.mobile}
                              className="h-7 border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                              onClick={() => openPreview(m, activeType)}
                            >
                              <MessageCircle className="h-3 w-3" />
                              Send
                            </Button>
                            {getSmsSentInfoText(m, activeType) ? (
                              <span
                                className="max-w-[180px] truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                title={getSmsSentInfoText(m, activeType)}
                              >
                                {getSmsSentInfoText(m, activeType)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-sm text-slate-500 dark:text-muted-foreground"
                      >
                        No members match this SMS condition.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="divide-y divide-slate-100 md:hidden dark:divide-border">
                {pageRows.map((m) => {
                  const suggested = primaryMessageActionForMember(m, { isOwner });
                  return (
                    <div key={`m-${activeType}-${m.memberId}`} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-foreground">
                            {m.name || m.memberId}
                          </p>
                          <p className="text-xs text-slate-500">{m.mobile || "No mobile"}</p>
                        </div>
                        <span className="text-[10px] font-medium text-slate-500">{m.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canActSuccess || !m.mobile}
                          className="h-7 border-emerald-300 bg-emerald-50 text-[11px] text-emerald-800"
                          onClick={() => openPreview(m, activeType)}
                        >
                          Send {smsTypeLabel(activeType)}
                        </Button>
                        {suggested.key !== "none" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("h-7 text-[11px]", suggestionToneClasses(suggested.key))}
                            disabled={suggested.disabled || !m.mobile}
                            onClick={() => openPreview(m, suggested.key)}
                          >
                            {suggested.label}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!pageRows.length ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    No members match this SMS condition.
                  </p>
                ) : null}
              </div>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Page {safePage} of {totalPages} · {rows.length} members
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 shadow-sm dark:border-border">
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Auto Sync Activity
            </h2>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">
              Status-triggered and campaign SMS events from the backend.
            </p>
          </div>
          <div className="space-y-2">
            {activityPageRows.map((e, i) => (
              <div
                key={String(e.id || i)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-border dark:text-muted-foreground"
              >
                {formatDate(String(e.createdAt || e.ts || e.at || ""))} ·{" "}
                {String(e.type || e.template || e.templateKey || "event")} ·{" "}
                {String(e.memberId || e.to || e.memberName || "—")}
              </div>
            ))}
            {!activityPageRows.length ? (
              <p className="text-sm text-muted-foreground">No SMS events yet.</p>
            ) : null}
          </div>
          {activityTotalPages > 1 ? (
            <div className="flex justify-end gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={safeActivityPage <= 1}
                onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safeActivityPage >= activityTotalPages}
                onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <MessagePreviewModal
        preview={preview}
        sending={sending}
        onClose={closePreview}
        onSend={() => void confirmSend()}
      />
    </div>
  );
}
