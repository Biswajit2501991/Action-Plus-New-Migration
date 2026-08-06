"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Pin,
  Plus,
  Search,
  Sun,
  Menu,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_GROUP_ORDER } from "@/lib/nav";
import { canAccessNavItem, canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { brandingForActiveBranch } from "@/lib/domain/branch-branding";
import {
  shouldShowBranchSwitcher,
  switchableBranchesForUser,
} from "@/lib/domain/branch-access";
import { staffRoleDisplayLabel } from "@/lib/domain/staff-role-label";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime";
import { useGymCodes } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { useWarmAppDataCache } from "@/hooks/use-warm-app-cache";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useUiStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { BranchLogo } from "@/components/branding/branch-logo";
import { StaffAvatar } from "@/components/staff-avatar";
import { CommandPalette } from "@/features/search/command-palette";
import { AddMemberHost } from "@/features/members/add-member-host";
import { HistoryControls } from "@/components/layout/history-controls";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { LateArrivalNoteHost } from "@/features/attendance/late-arrival-note-host";
import { PtMemberChatLoginToastHost } from "@/features/pt/pt-member-chat-login-toast-host";
import { AppSectionTabs } from "@/components/layout/section-tabs";
import { MobileShell } from "@/components/layout/mobile-shell";
import { MembersTodayVisitorBadge } from "@/components/layout/members-today-visitor-badge";
import { PortalChatUnreadBadge } from "@/components/layout/portal-chat-unread-badge";
import { Skeleton } from "@/components/ui/misc";

const SIDEBAR_GROUP_THEME: Record<
  string,
  {
    glow: string;
    heading: string;
    icon: string;
    active: string;
    hover: string;
  }
> = {
  "MEMBERS & CLIENTS": {
    glow: "rgba(34, 211, 238, 0.55)",
    heading: "text-cyan-700/90 dark:text-cyan-100/90",
    icon: "text-cyan-600 dark:text-cyan-200/95",
    active:
      "bg-cyan-500/16 text-cyan-900 shadow-sm ring-1 ring-cyan-300/45 dark:bg-cyan-400/28 dark:text-cyan-50",
    hover: "hover:bg-cyan-500/10 hover:text-cyan-900 dark:hover:text-cyan-50",
  },
  COMMUNICATION: {
    glow: "rgba(167, 139, 250, 0.58)",
    heading: "text-violet-700/90 dark:text-violet-100/90",
    icon: "text-violet-600 dark:text-violet-200/95",
    active:
      "bg-violet-500/16 text-violet-900 shadow-sm ring-1 ring-violet-300/45 dark:bg-violet-400/28 dark:text-violet-50",
    hover: "hover:bg-violet-500/10 hover:text-violet-900 dark:hover:text-violet-50",
  },
  OPERATIONS: {
    glow: "rgba(45, 212, 191, 0.55)",
    heading: "text-teal-700/90 dark:text-teal-100/90",
    icon: "text-teal-600 dark:text-teal-200/95",
    active:
      "bg-teal-500/16 text-teal-900 shadow-sm ring-1 ring-teal-300/45 dark:bg-teal-400/28 dark:text-teal-50",
    hover: "hover:bg-teal-500/10 hover:text-teal-900 dark:hover:text-teal-50",
  },
  FINANCE: {
    glow: "rgba(251, 191, 36, 0.55)",
    heading: "text-amber-700/90 dark:text-amber-100/90",
    icon: "text-amber-600 dark:text-amber-200/95",
    active:
      "bg-amber-500/16 text-amber-900 shadow-sm ring-1 ring-amber-300/45 dark:bg-amber-400/30 dark:text-amber-50",
    hover: "hover:bg-amber-500/10 hover:text-amber-900 dark:hover:text-amber-50",
  },
  "STAFF & MANAGEMENT": {
    glow: "rgba(232, 121, 249, 0.55)",
    heading: "text-fuchsia-700/90 dark:text-fuchsia-100/90",
    icon: "text-fuchsia-600 dark:text-fuchsia-200/95",
    active:
      "bg-fuchsia-500/16 text-fuchsia-900 shadow-sm ring-1 ring-fuchsia-300/45 dark:bg-fuchsia-400/28 dark:text-fuchsia-50",
    hover: "hover:bg-fuchsia-500/10 hover:text-fuchsia-900 dark:hover:text-fuchsia-50",
  },
  SYSTEM: {
    glow: "rgba(148, 163, 184, 0.5)",
    heading: "text-slate-700/90 dark:text-slate-100/90",
    icon: "text-slate-600 dark:text-slate-200/95",
    active:
      "bg-slate-500/16 text-slate-900 shadow-sm ring-1 ring-slate-300/45 dark:bg-slate-400/28 dark:text-slate-50",
    hover: "hover:bg-slate-500/10 hover:text-slate-900 dark:hover:text-slate-50",
  },
  "": {
    glow: "rgba(59, 130, 246, 0.55)",
    heading: "text-blue-700/90 dark:text-blue-100/90",
    icon: "text-blue-600 dark:text-blue-200/95",
    active:
      "bg-blue-500/16 text-blue-900 shadow-sm ring-1 ring-blue-300/45 dark:bg-blue-400/28 dark:text-blue-50",
    hover: "hover:bg-blue-500/10 hover:text-blue-900 dark:hover:text-blue-50",
  },
};

function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, changeBranch } = useAuth();
  const { data: gymCodes } = useGymCodes();
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileNavOpen,
    setMobileNavOpen,
    setCommandOpen,
    addMemberOpen,
    setAddMemberOpen,
    favorites,
    toggleFavorite,
    pushRecent,
  } = useUiStore();
  const { setTheme, resolvedTheme } = useTheme();
  const [fabHover, setFabHover] = useState(false);

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

  useEffect(() => {
    if (pathname) pushRecent(pathname);
  }, [pathname, pushRecent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  const visibleNav = NAV_ITEMS.filter((item) => canAccessNavItem(user, item));

  const groups = NAV_GROUP_ORDER.filter((group) =>
    visibleNav.some((n) => n.group === group),
  );

  /** Section whose route is current — only this group gets strong edge shine. */
  const activeGroup = useMemo(() => {
    const matches = NAV_ITEMS.filter(
      (item) =>
        canAccessNavItem(user, item) &&
        !item.external &&
        Boolean(pathname) &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );
    if (!matches.length) return null;
    // Prefer the longest href match (e.g. nested routes under a longer path).
    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0].group;
  }, [pathname, user]);

  const brandBlock = (collapsed: boolean) =>
    collapsed ? (
      <div className="mx-auto h-9 w-9 overflow-hidden rounded-full ring-1 ring-border">
        <BranchLogo src={brand.logoUrl} alt={brand.displayName} className="h-full w-full" />
      </div>
    ) : (
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
          <BranchLogo src={brand.logoUrl} alt={brand.displayName} className="h-full w-full" />
        </div>
        <div className="min-w-0">
          <p
            className="truncate text-[13px] font-semibold tracking-tight"
            data-testid="sidebar-gym-display-name"
          >
            {brand.displayName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">Gym Manager</p>
        </div>
      </div>
    );

  return (
    <div className="desktop-shell min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.06),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.08),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(2,6,23,0.6),_transparent_40%)]" />

      <div className="flex min-h-screen">
        <aside
          className={cn(
            "desktop-shell-nav sticky top-0 hidden h-screen flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl transition-all md:flex",
            sidebarCollapsed ? "w-[4.5rem]" : "w-[15.5rem]",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-4">
            <div className="min-w-0 flex-1">{brandBlock(sidebarCollapsed)}</div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-4">
            {groups.map((group) => {
              const theme = SIDEBAR_GROUP_THEME[group] || SIDEBAR_GROUP_THEME.SYSTEM;
              const sectionActive = activeGroup === group;
              return (
              <div
                key={group || "main"}
                className="sidebar-liquid-glass p-2.5"
                data-active={sectionActive ? "true" : "false"}
                style={{ ["--sidebar-glow" as string]: theme.glow }}
              >
                {!sidebarCollapsed && group ? (
                  <p
                    className={cn(
                      "mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider",
                      theme.heading,
                    )}
                  >
                    {group}
                  </p>
                ) : null}
                <div className="space-y-1">
                  {visibleNav
                    .filter((i) => i.group === group)
                    .map((item) => {
                      const active =
                        !item.external &&
                        (pathname === item.href || pathname.startsWith(`${item.href}/`));
                      const Icon = item.icon;
                      const linkClass = cn(
                        "flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                        active
                          ? theme.active
                          : cn("text-slate-700 dark:text-white/85", theme.hover),
                      );
                      return (
                        <div key={item.href} className="group relative flex items-center">
                          {item.external ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={linkClass}
                              title={item.label}
                            >
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  active ? "text-current" : theme.icon,
                                )}
                              />
                              {!sidebarCollapsed ? (
                                <span className="flex min-w-0 items-center gap-1 truncate">
                                  <span className="truncate">{item.label}</span>
                                  {item.href === "/members" ? (
                                    <MembersTodayVisitorBadge />
                                  ) : null}
                                  {item.href === "/portal-chat" ? (
                                    <PortalChatUnreadBadge />
                                  ) : null}
                                </span>
                              ) : null}
                            </a>
                          ) : (
                            <Link href={item.href} className={linkClass} title={item.label}>
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  active ? "text-current" : theme.icon,
                                )}
                              />
                              {!sidebarCollapsed ? (
                                <span className="flex min-w-0 items-center gap-1 truncate">
                                  <span className="truncate">{item.label}</span>
                                  {item.href === "/members" ? (
                                    <MembersTodayVisitorBadge />
                                  ) : null}
                                  {item.href === "/portal-chat" ? (
                                    <PortalChatUnreadBadge />
                                  ) : null}
                                </span>
                              ) : null}
                            </Link>
                          )}
                          {!sidebarCollapsed && !item.external ? (
                            <button
                              type="button"
                              className="absolute right-1 hidden rounded-lg p-1 text-muted-foreground hover:bg-background/60 group-hover:block"
                              onClick={() => toggleFavorite(item.href)}
                              aria-label="Pin favorite"
                            >
                              <Pin
                                className={cn(
                                  "h-3.5 w-3.5",
                                  favorites.includes(item.href) && "fill-current text-sky-600",
                                )}
                              />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              </div>
              );
            })}
          </nav>

          <div className="border-t border-border/70 p-3">
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed ? "Sign out" : null}
            </Button>
          </div>
        </aside>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileNavOpen(false)}>
            <aside
              className="absolute left-0 top-0 h-full w-[17.5rem] overflow-y-auto border-r border-border bg-background p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-2.5">
                <div className="h-10 w-10 overflow-hidden rounded-full ring-1 ring-border">
                  <BranchLogo src={brand.logoUrl} alt={brand.displayName} className="h-full w-full" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{brand.displayName}</p>
                  <p className="text-[11px] text-muted-foreground">Gym Manager</p>
                </div>
              </div>
              <div className="space-y-1">
                {visibleNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      pathname.startsWith(item.href)
                        ? "bg-slate-900 text-white dark:bg-teal-400 dark:text-slate-950"
                        : "hover:bg-accent",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex items-center gap-1">
                      {item.label}
                      {item.href === "/members" ? <MembersTodayVisitorBadge /> : null}
                      {item.href === "/portal-chat" ? <PortalChatUnreadBadge /> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-700 hover:bg-slate-900 hover:text-white md:hidden dark:text-slate-200 dark:hover:bg-teal-400 dark:hover:text-slate-950"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-accent"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 truncate">Search members, invoices, staff…</span>
              <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
            </button>

            <HistoryControls />

            <NotificationCenter />

            {showBranchSwitcher ? (
              <Select
                className="hidden w-[180px] sm:flex"
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

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle Day Night theme"
              title="Toggle Day / Night (turns off Auto in Settings)"
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-2.5 py-1.5">
              <StaffAvatar user={user} compact />
              <div className="hidden min-w-0 sm:block">
                <div className="truncate text-xs font-medium leading-tight">
                  {user?.name || user?.id}
                </div>
                <div
                  className="truncate text-[10px] text-muted-foreground"
                  data-testid="header-user-role"
                >
                  {staffRoleDisplayLabel(user)}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 space-y-4 px-4 py-6 sm:px-6 lg:px-8">
            <AppSectionTabs />
            {children}
          </main>
        </div>
      </div>

      <CommandPalette />
      <AddMemberHost />
      <LateArrivalNoteHost />
      <PtMemberChatLoginToastHost />

      {user &&
      canAccessSection(user, "Members") &&
      hasAccess(user, "members", "addMembers") &&
      !addMemberOpen ? (
        <button
          type="button"
          onClick={() => setAddMemberOpen(true)}
          onMouseEnter={() => setFabHover(true)}
          onMouseLeave={() => setFabHover(false)}
          onFocus={() => setFabHover(true)}
          onBlur={() => setFabHover(false)}
          className={cn(
            "fixed bottom-6 right-6 z-40 flex items-center rounded-full bg-slate-900 py-3 text-white shadow-lg transition-all hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300",
            fabHover ? "gap-2 px-4" : "gap-0 px-3",
          )}
          aria-label="Add Member"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          {fabHover ? <span className="pr-1 text-sm font-semibold">Add Member</span> : null}
        </button>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const isMobile = useIsMobile();

  useRealtimeSync(isAuthenticated);
  useStaffPhotoHydration(user ? [user] : []);
  useWarmAppDataCache(isAuthenticated);

  if (isMobile === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (isMobile) {
    return <MobileShell>{children}</MobileShell>;
  }

  return <DesktopShell>{children}</DesktopShell>;
}
