"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { settingsApi, whatsappApi } from "@/services/api";
import { resolveClientBranchBranding } from "@/lib/domain/branch-branding";
import {
  CUSTOM_TEMPLATE_TYPES,
  customTemplateCardTone,
  customTemplateTypeLabel,
  friendlyCustomTemplateApiError,
  isCustomTemplatesEnabled,
  slugFromTemplateName,
  validateCustomTemplateDraft,
  type CustomTemplate,
} from "@/lib/domain/custom-templates";
import {
  WHATSAPP_TYPE_META,
  type WhatsAppTemplateKey,
} from "@/lib/domain/whatsapp-templates";
import { hasAccess, isBranchAdminUser, isMasterOwnerUser } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { AppSettings, GymCode } from "@/types";

type Draft = {
  id?: string;
  templateName: string;
  templateType: string;
  messageBody: string;
  gymCodeId: string;
};

const EMPTY_DRAFT: Draft = {
  templateName: "",
  templateType: "promotional",
  messageBody: "",
  gymCodeId: "",
};

export function WhatsappTemplatesPanel({
  systemTemplates,
  onOpenMessagingCenter,
  onPreviewSystem,
}: {
  systemTemplates: Record<string, string>;
  onOpenMessagingCenter: () => void;
  onPreviewSystem: (key: WhatsAppTemplateKey) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();

  const isOwner = isMasterOwnerUser(user);
  const canPickBranch = isBranchAdminUser(user);
  const canEditTemplates =
    isOwner || hasAccess(user, "whatsapp", "viewTemplates");

  const assignedBranch = String(user?.activeBranchId || user?.gymCodeId || "").trim();
  const [branchId, setBranchId] = useState(assignedBranch);
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CustomTemplate | null>(null);

  useEffect(() => {
    if (!canPickBranch && assignedBranch) setBranchId(assignedBranch);
    else if (!branchId && assignedBranch) setBranchId(assignedBranch);
  }, [assignedBranch, canPickBranch, branchId]);

  const featureEnabled = isCustomTemplatesEnabled(settings as Record<string, unknown>);

  const customQuery = useQuery({
    queryKey: ["custom-templates", branchId || "none"],
    queryFn: () => whatsappApi.customTemplates(branchId || undefined),
    enabled: Boolean(branchId) && featureEnabled,
  });

  const customTemplates = useMemo(() => {
    const list = Array.isArray(customQuery.data?.templates)
      ? (customQuery.data!.templates as CustomTemplate[])
      : [];
    return list.filter((t) => t && t.isActive !== false && t.status !== "archived");
  }, [customQuery.data]);

  const branchLabel = useMemo(() => {
    const g = (gymCodes as GymCode[]).find((c) => c.id === branchId);
    if (!g) return branchId || "—";
    return `${g.code || "—"} / ${g.name || g.label || g.branchName || "Branch"}`;
  }, [gymCodes, branchId]);

  const saveFeatureFlag = useMutation({
    mutationFn: async (enabled: boolean) => {
      const patch: Record<string, boolean> = { customTemplatesEnabled: enabled };
      if (settings?.attendanceNotesEnabled === true) patch.attendanceNotesEnabled = true;
      if (settings?.qrVisitorIntakeEnabled === true || settings?.qrVisitorAttendanceEnabled === true) {
        patch.qrVisitorIntakeEnabled = true;
      }
      if (settings?.attendanceRequirePresenceQr === true) patch.attendanceRequirePresenceQr = true;
      if (settings?.paymentQrInReminderEnabled === true) patch.paymentQrInReminderEnabled = true;
      await settingsApi.bulk(patch);
    },
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const previous = qc.getQueriesData<AppSettings>({ queryKey: ["settings"] });
      qc.setQueriesData<AppSettings>({ queryKey: ["settings"] }, (old) =>
        old ? { ...old, customTemplatesEnabled: enabled } : old,
      );
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(e.message || "Could not update feature flag");
    },
    onSuccess: async (_data, enabled) => {
      qc.setQueriesData<AppSettings>({ queryKey: ["settings"] }, (old) =>
        old ? { ...old, customTemplatesEnabled: enabled } : old,
      );
      toast.success("Custom templates setting saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["custom-templates"] });
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const err = validateCustomTemplateDraft(draft);
      if (err) throw new Error(err);
      if (!draft.gymCodeId) throw new Error("invalid-gym-code-id");
      const code = slugFromTemplateName(draft.templateName);
      if (draft.id) {
        return whatsappApi.updateCustom(draft.id, {
          gymCodeId: draft.gymCodeId,
          templateName: draft.templateName.trim(),
          templateType: draft.templateType,
          messageBody: draft.messageBody,
        });
      }
      return whatsappApi.createCustom({
        gymCodeId: draft.gymCodeId,
        templateName: draft.templateName.trim(),
        templateCode: code,
        templateType: draft.templateType,
        messageBody: draft.messageBody,
        channel: "whatsapp",
      });
    },
    onSuccess: async () => {
      toast.success(draft.id ? "Template updated" : "Template created");
      setModalOpen(false);
      setDraft(EMPTY_DRAFT);
      setDraftError("");
      await qc.invalidateQueries({ queryKey: ["custom-templates"] });
    },
    onError: (e: Error) => {
      const msg = friendlyCustomTemplateApiError(e);
      setDraftError(msg);
      toast.error(msg);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (row: CustomTemplate) => {
      const id = String(row.id || "").trim();
      const gid = String(row.gymCodeId || branchId || "").trim();
      if (!id || !gid) throw new Error("custom-template-not-found");
      if (isOwner) return whatsappApi.deleteCustom(id, gid);
      return whatsappApi.archiveCustom(id, { gymCodeId: gid });
    },
    onSuccess: async () => {
      toast.success(isOwner ? "Template deleted" : "Template archived");
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ["custom-templates"] });
    },
    onError: (e: Error) => toast.error(friendlyCustomTemplateApiError(e)),
  });

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT, gymCodeId: branchId });
    setDraftError("");
    setModalOpen(true);
  };

  const openEdit = (row: CustomTemplate) => {
    setDraft({
      id: row.id,
      templateName: String(row.templateName || ""),
      templateType: String(row.templateType || "promotional"),
      messageBody: String(row.messageBody || ""),
      gymCodeId: String(row.gymCodeId || branchId),
    });
    setDraftError("");
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {isOwner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-white p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-950/30 dark:to-slate-950">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Custom WhatsApp Templates
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {featureEnabled
                ? "Create branch-specific templates such as Promotion or Festival Offer. They appear below the system templates."
                : "Enable to create branch-specific templates such as Promotion or Festival Offer."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={featureEnabled}
            aria-label="Enable custom WhatsApp templates"
            onClick={() => saveFeatureFlag.mutate(!featureEnabled)}
            className={cn(
              "relative h-8 w-[4.5rem] shrink-0 rounded-full transition-colors",
              featureEnabled ? "bg-sky-600 dark:bg-teal-500" : "bg-slate-300 dark:bg-slate-600",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-slate-700 shadow-sm transition-transform",
                featureEnabled && "translate-x-8",
              )}
            >
              {featureEnabled ? "On" : "Off"}
            </span>
          </button>
        </div>
      ) : null}

      {canPickBranch ? (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="min-w-[220px] flex-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Gym Branch (Gym Code)
            </Label>
            <Select
              className="mt-1 h-10 rounded-xl"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Select branch…</option>
              {(gymCodes as GymCode[]).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} / {g.name || g.label || g.branchName || g.id}
                </option>
              ))}
            </Select>
          </div>
          <p className="pb-2 text-xs text-slate-500 dark:text-slate-400">
            {customQuery.isFetching
              ? "Loading templates…"
              : `Editing templates for ${branchLabel}`}
          </p>
        </div>
      ) : branchId ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          Branch: <span className="font-semibold">{branchLabel}</span> (your assigned branch only)
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {featureEnabled
            ? customTemplates.length
              ? `${customTemplates.length} custom template${customTemplates.length === 1 ? "" : "s"} for this branch`
              : "No custom templates yet for this branch"
            : "System templates"}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="rounded-full"
            onClick={onOpenMessagingCenter}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Messaging Center
          </Button>
          {featureEnabled && canEditTemplates ? (
            <Button
              type="button"
              className="rounded-full bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
              disabled={!branchId}
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Template
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {WHATSAPP_TYPE_META.filter((t) => t.key !== "templates").map((card) => {
          const key = card.key as WhatsAppTemplateKey;
          const body = systemTemplates[key] || "";
          const open = Boolean(expandedTemplates[key]);
          return (
            <Card
              key={key}
              className={cn(
                "overflow-hidden border shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                card.tone,
                card.glow,
              )}
            >
              <div className={cn("h-1 w-full", card.accent)} />
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight">{card.title}</p>
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-current/55">
                      SMS / WhatsApp
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-black/5 bg-black/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-current/70 dark:border-white/10 dark:bg-white/5">
                    {key}
                  </span>
                </div>
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-xl border border-black/5 bg-white/85 p-3 text-xs leading-relaxed text-slate-700 shadow-inner dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200",
                    open ? "max-h-80 overflow-auto" : "line-clamp-4",
                  )}
                >
                  {body || "—"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!canEditTemplates}
                    onClick={() => toast.message("Edit system templates in Support → Templates")}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => onPreviewSystem(key)}
                  >
                    Send Now
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setExpandedTemplates((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                >
                  {open ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" /> Expand SMS
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {featureEnabled && customQuery.isLoading ? <Skeleton className="h-48" /> : null}

        {featureEnabled
          ? customTemplates.map((card) => {
              const open = Boolean(expandedTemplates[card.id]);
              const brand = resolveClientBranchBranding(
                (gymCodes as GymCode[]).find((g) => g.id === card.gymCodeId),
              );
              return (
                <Card
                  key={card.id}
                  className={cn(
                    "relative overflow-hidden border shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                    customTemplateCardTone(card.templateType),
                  )}
                >
                  {isOwner ? (
                    <button
                      type="button"
                      className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-700 shadow-sm hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-950/80"
                      aria-label="Delete template"
                      onClick={() => setDeleteTarget(card)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-2 pr-8">
                      <div className="h-8 w-8 overflow-hidden rounded-full ring-1 ring-black/5 dark:ring-white/10">
                        <BranchLogo
                          src={brand.logoUrl}
                          alt={brand.displayName}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {card.templateName || card.templateCode}
                        </p>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-current/55">
                          {customTemplateTypeLabel(card.templateType)} · {card.templateCode}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-xl border border-black/5 bg-white/85 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200",
                        open ? "max-h-80 overflow-auto" : "line-clamp-4",
                      )}
                    >
                      {card.messageBody || "—"}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!canEditTemplates}
                        onClick={() => openEdit(card)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          setExpandedTemplates((prev) => ({
                            ...prev,
                            [card.id]: !prev[card.id],
                          }))
                        }
                      >
                        {open ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          : null}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {draft.id ? "Edit custom template" : "Create custom template"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Branch-specific WhatsApp message for promotions and offers.
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-3 overflow-y-auto px-4 py-3">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input
                  className="mt-1"
                  value={draft.templateName}
                  onChange={(e) => setDraft((d) => ({ ...d, templateName: e.target.value }))}
                  placeholder="Festival Offer"
                />
                {!draft.id ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Code: {slugFromTemplateName(draft.templateName) || "—"}
                  </p>
                ) : null}
              </div>
              <div>
                <Label className="text-xs">Template type</Label>
                <Select
                  className="mt-1"
                  value={draft.templateType}
                  onChange={(e) => setDraft((d) => ({ ...d, templateType: e.target.value }))}
                >
                  {CUSTOM_TEMPLATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Gym branch</Label>
                <Select
                  className="mt-1"
                  value={draft.gymCodeId}
                  disabled={Boolean(draft.id) || !canPickBranch}
                  onChange={(e) => setDraft((d) => ({ ...d, gymCodeId: e.target.value }))}
                >
                  {(gymCodes as GymCode[]).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} / {g.name || g.label || g.branchName || g.id}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Message body</Label>
                <Textarea
                  className="mt-1 min-h-[160px]"
                  value={draft.messageBody}
                  onChange={(e) => setDraft((d) => ({ ...d, messageBody: e.target.value }))}
                  placeholder="Hello [CustomerName]! …"
                />
              </div>
              {draftError ? (
                <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  {draftError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveTemplate.mutate()}
                disabled={saveTemplate.isPending}
              >
                {saveTemplate.isPending ? "Saving…" : "Save template"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-4 shadow-xl">
            <h3 className="text-base font-semibold">Delete template?</h3>
            <p className="text-sm text-muted-foreground">
              Permanently remove{" "}
              <span className="font-medium text-foreground">
                {deleteTarget.templateName || deleteTarget.templateCode}
              </span>
              ?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteTemplate.isPending}
                onClick={() => deleteTemplate.mutate(deleteTarget)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
