"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SECTION_ORDER } from "@/lib/nav";
import {
  DEFAULT_ROLE_TEMPLATES,
  isMasterOwnerUser,
  roleTemplateColorClasses,
  type RoleTemplate,
} from "@/lib/domain/permissions";
import { cn, uid } from "@/lib/utils";
import { settingsApi } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useSettings } from "@/hooks/use-data";

type Props = {
  onUseTemplate: (role: RoleTemplate) => void;
};

const EMPTY: RoleTemplate = {
  id: "",
  title: "",
  subtitle: "",
  sections: [],
  color: "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]",
};

export function RoleTemplatesPanel({ onUseTemplate }: Props) {
  const user = useAuthStore((s) => s.user);
  const isOwner = isMasterOwnerUser(user);
  const qc = useQueryClient();
  const { data: settings } = useSettings();

  const templates = useMemo(() => {
    const fromSettings = Array.isArray(settings?.roleTemplates)
      ? (settings?.roleTemplates as RoleTemplate[])
      : [];
    return fromSettings.length ? fromSettings : DEFAULT_ROLE_TEMPLATES;
  }, [settings?.roleTemplates]);

  const persisted = Array.isArray(settings?.roleTemplates)
    ? (settings?.roleTemplates as RoleTemplate[])
    : [];

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RoleTemplate>(EMPTY);

  const persist = useMutation({
    mutationFn: (next: RoleTemplate[]) => settingsApi.roleTemplates(next),
    onSuccess: async () => {
      toast.success("Role templates saved");
      setOpen(false);
      setDraft(EMPTY);
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = () => {
    const title = String(draft.title || "").trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    const id = draft.id || uid("role");
    const nextItem: RoleTemplate = {
      id,
      title,
      subtitle: String(draft.subtitle || "").trim(),
      sections: Array.isArray(draft.sections) ? draft.sections : [],
      color: draft.color || EMPTY.color,
    };
    const base = persisted.length ? persisted : templates;
    const without = base.filter((r) => r.id !== id);
    persist.mutate([...without, nextItem]);
  };

  const remove = (role: RoleTemplate) => {
    if (!confirm(`Delete role template “${role.title}”?`)) return;
    const base = persisted.length ? persisted : templates;
    persist.mutate(base.filter((r) => r.id !== role.id));
  };

  const toggleSection = (section: string) => {
    const set = new Set(draft.sections || []);
    if (set.has(section)) set.delete(section);
    else set.add(section);
    setDraft({ ...draft, sections: Array.from(set) });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Templates
          </p>
          <h2 className="text-base font-semibold tracking-tight">Role presets</h2>
        </div>
        {isOwner ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft({ ...EMPTY, id: "" });
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add role
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((role) => (
          <Card
            key={role.id}
            className={cn(
              "overflow-hidden border shadow-sm text-slate-900 dark:text-slate-100",
              roleTemplateColorClasses(role.color),
            )}
          >
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {role.title}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {role.subtitle || "Role template"}
                  </p>
                </div>
                <Shield className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <p className="line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">
                {(role.sections || []).join(" · ") || "No sections"}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-slate-300 bg-white/80 text-slate-800 hover:bg-white dark:border-white/20 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1]"
                  onClick={() => onUseTemplate(role)}
                >
                  Create staff
                </Button>
                {isOwner ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
                      onClick={() => {
                        setDraft({
                          id: role.id,
                          title: role.title,
                          subtitle: role.subtitle || "",
                          sections: [...(role.sections || [])],
                          color: role.color,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hover:bg-rose-500/10"
                      onClick={() => remove(role)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClassicalModal
        open={open}
        title={draft.id ? "Edit role template" : "Add role template"}
        description="Presets seed section access when creating staff."
        onClose={() => {
          setOpen(false);
          setDraft(EMPTY);
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setDraft(EMPTY);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={persist.isPending}
              onClick={saveDraft}
              className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            >
              {persist.isPending ? "Saving…" : "Save template"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input
              className="mt-1"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              className="mt-1"
              value={draft.subtitle || ""}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </div>
          <div>
            <Label>Sections</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SECTION_ORDER.map((section) => {
                const on = (draft.sections || []).includes(section);
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => toggleSection(section)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                      on
                        ? "border-slate-900 bg-slate-900 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300",
                    )}
                  >
                    {section}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ClassicalModal>
    </>
  );
}
