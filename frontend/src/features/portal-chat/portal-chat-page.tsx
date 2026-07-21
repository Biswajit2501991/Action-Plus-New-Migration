"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api/client";
import { useAuthStore } from "@/stores";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";

type Thread = {
  id: string;
  member_uuid: string;
  status: string;
  subject: string | null;
  updated_at: string;
  member?: { full_name?: string; member_code?: string; mobile?: string } | null;
};

export function PortalChatPage() {
  const user = useAuthStore((s) => s.user);
  const canUse =
    canAccessSection(user, "WhatsApp Verification") ||
    canAccessSection(user, "Members");
  const canReply = hasAccess(user, "members", "editMembers");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{ id: string; sender: string; body: string; staff_name?: string; created_at: string }>
  >([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    const data = await apiFetch<{ ok?: boolean; items?: Thread[] }>("/portal-chat/threads");
    setThreads(Array.isArray(data.items) ? data.items : []);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const data = await apiFetch<{ ok?: boolean; items?: typeof messages }>(
      `/portal-chat/threads/${encodeURIComponent(id)}/messages`,
    );
    setMessages(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => {
    if (!canUse) return;
    void loadThreads().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [canUse, loadThreads]);

  useEffect(() => {
    if (!active) return;
    void loadMessages(active).catch(() => null);
    const id = window.setInterval(() => void loadMessages(active).catch(() => null), 8000);
    return () => window.clearInterval(id);
  }, [active, loadMessages]);

  if (!canUse) {
    return <div className="p-6 text-sm text-muted-foreground">No access.</div>;
  }

  async function send() {
    if (!active || !text.trim()) return;
    try {
      await apiFetch(`/portal-chat/threads/${encodeURIComponent(active)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text.trim() }),
      });
      setText("");
      await loadMessages(active);
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-[280px_1fr] md:p-6">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Member Portal Chat</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActive(t.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  active === t.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <p className="font-medium">
                  {t.member?.full_name || "Member"}{" "}
                  <span className="text-xs text-muted-foreground">
                    {t.member?.member_code || ""}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t.status}</p>
              </button>
            </li>
          ))}
          {!threads.length ? (
            <li className="text-sm text-muted-foreground">No member chats yet.</li>
          ) : null}
        </ul>
      </div>
      <div className="rounded-xl border border-border p-4">
        {!active ? (
          <p className="text-sm text-muted-foreground">Select a thread.</p>
        ) : (
          <>
            <div className="mb-3 max-h-96 space-y-2 overflow-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.sender === "staff" ? "bg-muted ml-8" : "bg-primary/10 mr-8"
                  }`}
                >
                  <p>{m.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {m.sender === "staff" ? m.staff_name || "Staff" : "Member"}
                  </p>
                </div>
              ))}
            </div>
            {canReply ? (
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
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
  );
}
