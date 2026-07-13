"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Pin,
  Search,
  Sun,
  Menu,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { canAccessSection } from "@/lib/domain/permissions";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime";
import { useGymCodes } from "@/hooks/use-data";
import { useUiStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { CommandPalette } from "@/features/search/command-palette";

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
    favorites,
    toggleFavorite,
    pushRecent,
  } = useUiStore();
  const { theme, setTheme } = useTheme();

  useRealtimeSync(isAuthenticated);

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

  const groups = Array.from(new Set(visibleNav.map((n) => n.group)));

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
            {!sidebarCollapsed ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">
                  Action Plus
                </p>
                <p className="text-sm font-semibold">Gym Manager</p>
              </div>
            ) : (
              <span className="mx-auto text-sm font-bold text-teal-700 dark:text-teal-400">AP</span>
            )}
            <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {groups.map((group) => (
              <div key={group}>
                {!sidebarCollapsed ? (
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
                                ? "bg-teal-600 text-white shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            title={item.label}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                            {!sidebarCollapsed && item.tier === "C" ? (
                              <span className="ml-auto text-[10px] opacity-70">Soon</span>
                            ) : null}
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
                                  favorites.includes(item.href) && "fill-current text-teal-600",
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
              <p className="mb-4 text-sm font-semibold">Action Plus</p>
              <div className="space-y-1">
                {visibleNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                      pathname.startsWith(item.href) ? "bg-teal-600 text-white" : "hover:bg-accent",
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

            <div className="hidden items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs sm:flex">
              <span className="font-medium">{user?.name || user?.id}</span>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

          <nav className="sticky bottom-0 z-30 flex border-t border-border/70 bg-background/90 px-2 py-2 backdrop-blur-xl lg:hidden">
            {visibleNav
              .filter((i) => ["/dashboard", "/members", "/attendance", "/finance", "/settings"].includes(i.href))
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px]",
                    pathname.startsWith(item.href) ? "text-teal-700 dark:text-teal-400" : "text-muted-foreground",
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
    </div>
  );
}
