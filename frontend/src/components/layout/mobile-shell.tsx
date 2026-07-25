"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  Dumbbell,
  Grid2X2,
  LayoutDashboard,
  Moon,
  Plane,
  Plus,
  Search,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { brandingForActiveBranch } from "@/lib/domain/branch-branding";
import {
  shouldShowBranchSwitcher,
  switchableBranchesForUser,
} from "@/lib/domain/branch-access";
import { staffRoleDisplayLabel } from "@/lib/domain/staff-role-label";
import { useAuth } from "@/hooks/use-auth";
import { useGymCodes } from "@/hooks/use-data";
import { useUiStore } from "@/stores";
import { BranchLogo } from "@/components/branding/branch-logo";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { CommandPalette } from "@/features/search/command-palette";
import { AddMemberHost } from "@/features/members/add-member-host";
import { HistoryControls } from "@/components/layout/history-controls";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { LateArrivalNoteHost } from "@/features/attendance/late-arrival-note-host";
import { MobileAccessGuard } from "@/components/layout/mobile-access-guard";
import { MembersTodayVisitorBadge } from "@/components/layout/members-today-visitor-badge";

const MOBILE_TABS = [
  { href: "/dashboard", label: "Home", mobileKey: "viewHome", icon: LayoutDashboard },
  { href: "/members", label: "Members", mobileKey: "viewMembers", icon: Users },
  { href: "/pt", label: "PT", mobileKey: "viewPt", icon: Dumbbell },
  { href: "/staff", label: "Staff", mobileKey: "viewStaff", icon: UserCog },
  { href: "/leave", label: "Leave", mobileKey: "viewLeave", icon: Plane },
] as const;

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, changeBranch, isAuthenticated } = useAuth();
  const { data: gymCodes } = useGymCodes();
  const { setCommandOpen, addMemberOpen, setAddMemberOpen } = useUiStore();
  const { setTheme, resolvedTheme } = useTheme();

  const brand = useMemo(
    () =>
      brandingForActiveBranch(
        gymCodes,
        user?.activeBranchId || user?.gymCodeId || null,
      ),
    [gymCodes, user?.activeBranchId, user?.gymCodeId],
  );

  const switchableBranches = useMemo(
    () => switchableBranchesForUser(user, gymCodes || []),
    [user, gymCodes],
  );
  const showBranchSwitcher = shouldShowBranchSwitcher(user, gymCodes || []);

  const tabs = MOBILE_TABS.filter((t) => hasAccess(user, "mobile", t.mobileKey));
  const showMore = hasAccess(user, "mobile", "viewMore");
  const fabVisible =
    Boolean(user) &&
    hasAccess(user, "mobile", "viewMembers") &&
    hasAccess(user, "mobile", "membersAdd") &&
    hasAccess(user, "members", "addMembers") &&
    !addMemberOpen &&
    (pathname.startsWith("/members") || pathname.startsWith("/dashboard"));

  if (!isAuthenticated) return null;

  return (
    <div className="mobile-shell relative min-h-dvh bg-[#f3f1ec] text-slate-900 dark:bg-[#070b12] dark:text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.14),_transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(120,113,108,0.12),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.1),_transparent_48%),radial-gradient(ellipse_at_bottom,_rgba(2,6,23,0.85),_transparent_40%)]" />

      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f3f1ec]/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-white/5 dark:bg-[#070b12]/85">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10">
            <BranchLogo src={brand.logoUrl} alt={brand.displayName} className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight">
              {brand.displayName}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {staffRoleDisplayLabel(user)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle Day Night theme"
            title="Toggle Day / Night (turns off Auto in Settings)"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
          {showMore ? (
            <Link
              href="/more"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border border-black/5 bg-white/70 text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
                pathname.startsWith("/more") && "ring-1 ring-teal-500/40",
              )}
              aria-label="More modules"
            >
              <Grid2X2 className="h-4 w-4" />
            </Link>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-11 flex-1 items-center gap-2 rounded-2xl border border-black/5 bg-white/80 px-3.5 text-left text-sm text-slate-500 shadow-sm dark:border-white/8 dark:bg-white/[0.04] dark:text-slate-400"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search members…</span>
          </button>
          <HistoryControls />
          <NotificationCenter />
          {showBranchSwitcher ? (
            <Select
              className="h-11 w-[7.5rem] rounded-2xl border-black/5 bg-white/80 text-xs dark:border-white/8 dark:bg-white/[0.04]"
              value={user?.activeBranchId || user?.gymCodeId || ""}
              onChange={(e) => void changeBranch(e.target.value)}
            >
              {switchableBranches.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.label || g.code || g.id}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4">
        <MobileAccessGuard>{children}</MobileAccessGuard>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-[#f3f1ec]/92 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-white/5 dark:bg-[#070b12]/92">
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium tracking-wide transition",
                  active
                    ? "bg-slate-900 text-white shadow-md dark:bg-teal-400 dark:text-slate-950"
                    : "text-slate-500 hover:bg-black/[0.03] dark:text-slate-400 dark:hover:bg-white/5",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                <span className="inline-flex max-w-full items-center justify-center gap-0.5 truncate">
                  <span className="truncate">{tab.label}</span>
                  {tab.href === "/members" ? (
                    <MembersTodayVisitorBadge compact className="max-w-[2.5rem] truncate" />
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {fabVisible ? (
        <button
          type="button"
          onClick={() => setAddMemberOpen(true)}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.55)] dark:bg-teal-400 dark:text-slate-950"
          aria-label="Add Member"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      ) : null}

      <CommandPalette />
      <AddMemberHost />
      <LateArrivalNoteHost />
    </div>
  );
}
