"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api/client";
import { useAuthStore } from "@/stores";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";

type MemberRow = {
  member_uuid: string;
  thread_id: string;
  status: string;
  updated_at: string;
  member?: {
    full_name?: string;
    member_code?: string;
    mobile?: string;
    status?: string;
  } | null;
};

type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  staff_name?: string;
  created_at: string;
};

function formatMsgTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function PortalChatPage() {
  const user = useAuthStore((s) => s.user);
  const canUse =
    canAccessSection(user, "WhatsApp Verification") ||
    canAccessSection(user, "Members");
  const canReply = hasAccess(user, "members", "editMembers");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [retentionDraft, setRetentionDraft] = useState("7");
  const [savingRetention, setSavingRetention] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadMembers = useCallback(async () => {
    const data = await apiFetch<{
      ok?: boolean;
      items?: MemberRow[];
      retentionDays?: number;
    }>("/portal-chat/members");
    setMembers(Array.isArray(data.items) ? data.items : []);
    if (typeof data.retentionDays === "number" && data.retentionDays > 0) {
      setRetentionDays(data.retentionDays);
      setRetentionDraft(String(data.retentionDays));
    }
  }, []);

  const loadMessages = useCallback(async (memberUuid: string) => {
    const data = await apiFetch<{
      ok?: boolean;
      items?: ChatMessage[];
      retentionDays?: number;
    }>(`/portal-chat/members/${encodeURIComponent(memberUuid)}/messages`);
    setMessages(Array.isArray(data.items) ? data.items : []);
    if (typeof data.retentionDays === "number" && data.retentionDays > 0) {
      setRetentionDays(data.retentionDays);
    }
  }, []);

  useEffect(() => {
    if (!canUse) return;
    void loadMembers().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [canUse, loadMembers]);

  useEffect(() => {
    if (!activeMember) return;
    void loadMessages(activeMember).catch(() => null);
    const id = window.setInterval(
      () => void loadMessages(activeMember).catch(() => null),
      8000,
    );
    return () => window.clearInterval(id);
  }, [activeMember, loadMessages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = m.member?.full_name || "";
      const code = m.member?.member_code || "";
      const mobile = m.member?.mobile || "";
      return (
        name.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        mobile.toLowerCase().includes(q)
      );
    });
  }, [members, search]);

  const activeRow = members.find((m) => m.member_uuid === activeMember) || null;

  async function send() {
    if (!activeMember || !text.trim()) return;
    try {
      await apiFetch(
        `/portal-chat/members/${encodeURIComponent(activeMember)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ body: text.trim() }),
        },
      );
      setText("");
      await loadMessages(activeMember);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    }
  }

  async function saveRetention() {
    const days = Number(retentionDraft);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      setError("Retention must be between 1 and 365 days");
      return;
    }
    setSavingRetention(true);
    setError(null);
    try {
      const data = await apiFetch<{
        ok?: boolean;
        settings?: { chat_retention_days?: number };
      }>("/portal-settings", {
        method: "PUT",
        body: JSON.stringify({ chat_retention_days: Math.floor(days) }),
      });
      const saved = Number(data.settings?.chat_retention_days) || Math.floor(days);
      setRetentionDays(saved);
      setRetentionDraft(String(saved));
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save retention");
    } finally {
      setSavingRetention(false);
    }
  }

  async function runPurge() {
    setPurging(true);
    setError(null);
    try {
      await apiFetch("/portal-chat/purge", { method: "POST", body: "{}" });
      await loadMembers();
      if (activeMember) await loadMessages(activeMember);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurging(false);
    }
  }

  if (!canUse) {
    return <div className="p-6 text-sm text-muted-foreground">No access.</div>;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5.5rem)] max-w-6xl flex-col gap-3 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Member Portal Chat</h1>
          <p className="text-xs text-muted-foreground">
            Chat will be erased after {retentionDays} day
            {retentionDays === 1 ? "" : "s"}.
          </p>
        </div>
        {canReply ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-xs text-muted-foreground" htmlFor="chat-retention">
              Delete after (days)
            </label>
            <input
              id="chat-retention"
              type="number"
              min={1}
              max={365}
              className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={retentionDraft}
              onChange={(e) => setRetentionDraft(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingRetention}
              onClick={() => void saveRetention()}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={purging}
              onClick={() => void runPurge()}
            >
              Delete old now
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(260px,340px)_1fr]">
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member name, code, mobile…"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const selected = activeMember === m.member_uuid;
                  return (
                    <tr
                      key={m.member_uuid}
                      className={`cursor-pointer border-b border-border/60 ${
                        selected ? "bg-primary/10" : "hover:bg-muted/40"
                      }`}
                      onClick={() => setActiveMember(m.member_uuid)}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium leading-tight">
                          {m.member?.full_name || "Member"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.member?.member_code || "—"}
                          {m.member?.mobile ? ` · ${m.member.mobile}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top capitalize text-xs text-muted-foreground">
                        {m.status}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-sm text-muted-foreground">
                      {members.length ? "No members match search." : "No member chats yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          {!activeMember ? (
            <p className="p-4 text-sm text-muted-foreground">
              Select a member to view their full chat.
            </p>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <p className="font-medium">
                  {activeRow?.member?.full_name || "Member"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeRow?.member?.member_code || ""}
                  {activeRow?.member?.mobile
                    ? ` · ${activeRow.member.mobile}`
                    : ""}
                </p>
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                  Chat will be erased after {retentionDays} day
                  {retentionDays === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      m.sender === "staff"
                        ? "ml-8 bg-muted"
                        : "mr-8 bg-primary/10"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {m.sender === "staff"
                        ? m.staff_name || "Staff"
                        : "Member"}{" "}
                      · {formatMsgTime(m.created_at)}
                    </p>
                  </div>
                ))}
                {!messages.length ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : null}
              </div>
              {canReply ? (
                <div className="flex gap-2 border-t border-border p-3">
                  <input
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Reply…"
                  />
                  <Button type="button" size="sm" onClick={() => void send()}>
                    Send
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
