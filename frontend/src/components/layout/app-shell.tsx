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
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { brandingForActiveBranch } from "@/lib/domain/branch-branding";
import { staffRoleDisplayLabel } from "@/lib/domain/staff-role-label";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime";
import { useGymCodes } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { useUiStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { BranchLogo } from "@/components/branding/branch-logo";
import { StaffAvatar } from "@/components/staff-avatar";
import { CommandPalette } from "@/features/search/command-palette";
import { AddMemberHost } from "@/features/members/add-member-host";
import { AppSectionTabs } from "@/components/layout/section-tabs";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, changeBranch, isAuthenticated } = useAuth();
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
  const { theme, setTheme } = useTheme();
  const [fabHover, setFabHover] = useState(false);

  useRealtimeSync(isAuthenticated);
  useStaffPhotoHydration(user ? [user] : []);

  const brand = useMemo(
    () =>
      brandingForActiveBranch(
        gymCodes,
        user?.activeBranchId || user?.gymCodeId || null,
      ),
    [gymCodes, user?.activeBranchId, user?.gymCodeId],
  );

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

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (!item.section) return true;
    return canAccessSection(user, item.section);
  });

  const groups = NAV_GROUP_ORDER.filter((group) =>
    visibleNav.some((n) => n.group === group),
  );

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
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.06),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.08),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(2,6,23,0.6),_transparent_40%)]" />

      <div className="flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl transition-all lg:flex",
            sidebarCollapsed ? "w-[76px]" : "w-[260px]",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-5">
            {brandBlock(sidebarCollapsed)}
            <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {groups.map((group) => (
              <div key={group || "main"}>
                {!sidebarCollapsed && group ? (
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                ) : null}
                <div className="space-y-1">
                  {visibleNav
                    .filter((i) => i.group === group)
                    .map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      return (
                        <div key={item.href} className="group relative flex items-center">
                          <Link
                            href={item.href}
                            className={cn(
                              "flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-sky-600 text-white shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            title={item.label}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                          </Link>
                          {!sidebarCollapsed ? (
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
            ))}
          </nav>

          <div className="border-t border-border/70 p-3">
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed ? "Sign out" : null}
            </Button>
          </div>
        </aside>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileNavOpen(false)}>
            <aside
              className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto border-r border-border bg-background p-4"
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
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                      pathname.startsWith(item.href) ? "bg-sky-600 text-white" : "hover:bg-accent",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
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
              className="lg:hidden"
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

            {(gymCodes?.length || 0) > 1 ? (
              <Select
                className="hidden w-[180px] sm:flex"
                value={user?.activeBranchId || user?.gymCodeId || ""}
                onChange={(e) => void changeBranch(e.target.value)}
              >
                {(gymCodes || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || g.label || g.code || g.id}
                  </option>
                ))}
              </Select>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
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

          <nav className="sticky bottom-0 z-30 flex border-t border-border/70 bg-background/90 px-2 py-2 backdrop-blur-xl lg:hidden">
            {visibleNav
              .filter((i) =>
                ["/dashboard", "/members", "/attendance", "/finance", "/settings"].includes(i.href),
              )
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px]",
                    pathname.startsWith(item.href)
                      ? "text-sky-700 dark:text-sky-400"
                      : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label.split(" ")[0]}
                </Link>
              ))}
          </nav>
        </div>
      </div>

      <CommandPalette />
      <AddMemberHost />

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
            "fixed right-4 z-40 flex items-center rounded-full bg-sky-600 py-3 text-white shadow-lg transition-all hover:bg-sky-700 md:right-6",
            "bottom-24 md:bottom-6",
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
