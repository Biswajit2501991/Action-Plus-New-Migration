"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useAuthStore, useUiStore } from "@/stores";
import { useGymCodes, useMembers, useSettings } from "@/hooks/use-data";
import { NAV_ITEMS } from "@/lib/nav";
import { memberSearchHaystack } from "@/lib/domain/members";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { EditMemberModal } from "@/features/members/edit-member-modal";
import type { Member } from "@/types";

export function CommandPalette() {
  const router = useRouter();
  const qc = useQueryClient();
  const { commandOpen, setCommandOpen } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const { data: members = [] } = useMembers();
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);

  const canEditMember = hasAccess(user, "members", "editMembers");

  useEffect(() => {
    if (!commandOpen) setQ("");
  }, [commandOpen]);

  const nav = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (!item.section) return true;
        return canAccessSection(user, item.section);
      }),
    [user],
  );

  const memberHits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return members.slice(0, 8);
    return members.filter((m) => memberSearchHaystack(m).includes(query)).slice(0, 12);
  }, [members, q]);

  const openMember = (m: Member) => {
    setCommandOpen(false);
    if (canEditMember) {
      setEditing(m);
      return;
    }
    router.push(`/members?q=${encodeURIComponent(m.memberId)}`);
  };

  if (!commandOpen && !editing) return null;

  return (
    <>
      {commandOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setCommandOpen(false)}
            aria-label="Close"
          />
          <Command
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            shouldFilter={false}
          >
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search members, pages, invoices…"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
            />
            <Command.List className="max-h-[420px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
              <Command.Group heading="Pages" className="px-1 py-2 text-xs text-muted-foreground">
                {nav
                  .filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()))
                  .map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => {
                        setCommandOpen(false);
                        router.push(item.href);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground aria-selected:bg-accent"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group heading="Members" className="px-1 py-2 text-xs text-muted-foreground">
                {memberHits.map((m) => (
                  <Command.Item
                    key={m.memberId}
                    value={`${m.name} ${m.memberId} ${m.mobile}`}
                    onSelect={() => openMember(m)}
                    className="cursor-pointer rounded-xl px-3 py-2 text-sm aria-selected:bg-accent"
                  >
                    <div className="font-medium">{m.name || m.memberId}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.memberId} · {m.mobile || "no phone"} · {m.status || "Active"}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      ) : null}

      {editing && canEditMember ? (
        <EditMemberModal
          key={editing.memberId}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ["members"] });
          }}
          settings={settings}
          gymCodes={gymCodes}
          currentUser={user}
          planOptions={settings?.plans}
          statusOptions={settings?.statuses || ["Active", "Hold", "Deactivated", "Cancelled"]}
          holdOptions={settings?.holdDurations}
          paymentOptions={settings?.paymentMethods}
        />
      ) : null}
    </>
  );
}
