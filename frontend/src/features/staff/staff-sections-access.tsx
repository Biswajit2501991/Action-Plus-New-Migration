"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_ACCESS_CONFIG,
  MOBILE_TAB_PERMISSIONS,
  MOBILE_FEATURE_PERMISSIONS,
  MOBILE_MORE_PERMISSIONS,
  ALL_MOBILE_PERMISSIONS,
  isAccessChildEnabled,
  isMobileAccessEnabled,
  normalizeAccess,
  toggleAccessChild,
  toggleAccessParent,
  toggleAllSectionsAccess,
  toggleAllMobileAccess,
  toggleMobileAccessChild,
  type StaffAccessFormSlice,
} from "@/lib/domain/permissions";
import type { AccessMap } from "@/types";

type StaffSectionsAccessEditorProps = {
  sections: string[];
  access: AccessMap;
  onChange: (next: StaffAccessFormSlice) => void;
  /** Expand all panels by default when editing an existing staff row. */
  expandAllOnMount?: boolean;
};

function MobilePermGroup({
  title,
  perms,
  form,
  onChange,
}: {
  title: string;
  perms: { key: string; label: string }[];
  form: StaffAccessFormSlice;
  onChange: (next: StaffAccessFormSlice) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {perms.map((perm) => {
          const on = isMobileAccessEnabled(form.access, perm.key);
          return (
            <label
              key={perm.key}
              className="inline-flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded"
                checked={on}
                onChange={() => onChange(toggleMobileAccessChild(form, perm.key))}
              />
              <span>{perm.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function StaffSectionsAccessEditor({
  sections,
  access,
  onChange,
  expandAllOnMount = false,
}: StaffSectionsAccessEditorProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!expandAllOnMount) {
      setOpen({});
      setMobileOpen(false);
      return;
    }
    const next: Record<string, boolean> = {};
    for (const cfg of SECTION_ACCESS_CONFIG) {
      if (cfg.children.length || cfg.extraGroups?.length) next[cfg.section] = true;
    }
    setOpen(next);
    setMobileOpen(true);
  }, [expandAllOnMount]);

  const form: StaffAccessFormSlice = { sections, access: normalizeAccess(access) };
  const allSelected = SECTION_ACCESS_CONFIG.every((c) => sections.includes(c.section));
  const allMobileOn = ALL_MOBILE_PERMISSIONS.every((p) =>
    isMobileAccessEnabled(form.access, p.key),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Web view — sections & access</div>
            <p className="text-xs text-muted-foreground">
              Desktop sidebar and full desk. Expand each section for cards, tabs, and actions.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(toggleAllSectionsAccess(form))}
              className="rounded"
            />
            All
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SECTION_ACCESS_CONFIG.map((cfg) => {
            const checked = sections.includes(cfg.section);
            const hasChildren = Boolean(cfg.children.length || cfg.extraGroups?.length);
            const isOpen = Boolean(open[cfg.section]);

            return (
              <div
                key={cfg.section}
                className={cn(
                  "rounded-xl border p-2.5",
                  hasChildren ? "sm:col-span-2" : "",
                  checked
                    ? "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20"
                    : "border-border bg-muted/20",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange(toggleAccessParent(form, cfg.section))}
                      className="rounded"
                    />
                    {cfg.section}
                  </label>
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((prev) => ({ ...prev, [cfg.section]: !prev[cfg.section] }))
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent"
                    >
                      {isOpen ? "Hide Access" : "Expand Access"}
                    </button>
                  ) : null}
                </div>

                {hasChildren && isOpen ? (
                  <div className="mt-2 space-y-3 border-t border-border/60 pt-2">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {cfg.children.map((perm) => {
                        if (!cfg.accessGroup) return null;
                        const on = isAccessChildEnabled(form.access, cfg.accessGroup, perm.key);
                        return (
                          <label
                            key={perm.key}
                            className="inline-flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded"
                              checked={on}
                              onChange={() =>
                                onChange(
                                  toggleAccessChild(form, cfg.accessGroup!, perm.key, cfg.section),
                                )
                              }
                            />
                            <span>{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    {cfg.extraGroups?.map((extra) => (
                      <div key={extra.group} className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {extra.title}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {extra.children.map((perm) => {
                            const on = isAccessChildEnabled(form.access, extra.group, perm.key);
                            return (
                              <label
                                key={perm.key}
                                className="inline-flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 rounded"
                                  checked={on}
                                  onChange={() =>
                                    onChange(
                                      toggleAccessChild(form, extra.group, perm.key, cfg.section),
                                    )
                                  }
                                />
                                <span>{perm.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "rounded-xl border p-3",
          allMobileOn
            ? "border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20"
            : "border-border bg-muted/20",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Mobile view — tabs & subsections</div>
            <p className="text-xs text-muted-foreground">
              Phone shell only. Independent from web sections above (defaults to all on).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allMobileOn}
                onChange={() => onChange(toggleAllMobileAccess(form))}
                className="rounded"
              />
              All
            </label>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent"
            >
              {mobileOpen ? "Hide Access" : "Expand Access"}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="mt-3 space-y-4 border-t border-border/60 pt-3">
            <MobilePermGroup
              title="Bottom tabs"
              perms={MOBILE_TAB_PERMISSIONS}
              form={form}
              onChange={onChange}
            />
            <MobilePermGroup
              title="Home · Members · Leave actions"
              perms={MOBILE_FEATURE_PERMISSIONS}
              form={form}
              onChange={onChange}
            />
            <MobilePermGroup
              title="More menu modules"
              perms={MOBILE_MORE_PERMISSIONS}
              form={form}
              onChange={onChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
