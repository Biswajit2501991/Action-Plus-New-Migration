"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { NAV_ITEMS } from "@/lib/nav";
import { canAccessSection } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

export default function MorePage() {
  const user = useAuthStore((s) => s.user);
  const items = NAV_ITEMS.filter((item) => !item.section || canAccessSection(user, item.section));
  return (
    <div>
      <PageHeader title="More" description="All modules" />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-border bg-card/70 p-4 text-sm font-medium hover:bg-accent">
            <item.icon className="mb-2 h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
