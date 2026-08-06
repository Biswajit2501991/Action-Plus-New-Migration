import type { PtChatMessage, PtClientProfile } from "@/types/pt";

const CHAT_CAP = 100;

export function maxIsoTimestamp(...values: Array<string | null | undefined>): string | undefined {
  let best = "";
  let bestMs = -Infinity;
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = raw;
  }
  return best || undefined;
}

/** Union chat arrays by message id (newest-first, capped). Prevents stale saves from wiping member messages. */
export function mergePtChatMessages(
  a: PtChatMessage[] | null | undefined,
  b: PtChatMessage[] | null | undefined,
): PtChatMessage[] {
  const byId = new Map<string, PtChatMessage>();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      if (!id) continue;
      const prev = byId.get(id);
      byId.set(id, prev ? { ...prev, ...row, id } : { ...row, id });
    }
  }
  return [...byId.values()]
    .sort((x, y) => {
      const tx = Date.parse(String(x.ts || "")) || 0;
      const ty = Date.parse(String(y.ts || "")) || 0;
      return ty - tx;
    })
    .slice(0, CHAT_CAP);
}

/** Merge chat + chat timestamps into a profile without dropping either side's messages. */
export function withMergedPtChat(
  base: PtClientProfile,
  other: PtClientProfile | null | undefined,
): PtClientProfile {
  const o = other && typeof other === "object" ? other : {};
  const chat = mergePtChatMessages(base.chat, o.chat);
  const lastMemberChatAt =
    maxIsoTimestamp(base.lastMemberChatAt, o.lastMemberChatAt) || base.lastMemberChatAt || o.lastMemberChatAt;
  const lastTrainerChatAt =
    maxIsoTimestamp(base.lastTrainerChatAt, o.lastTrainerChatAt) || base.lastTrainerChatAt || o.lastTrainerChatAt;
  const lastChatAt =
    maxIsoTimestamp(base.lastChatAt, o.lastChatAt, lastMemberChatAt, lastTrainerChatAt) ||
    base.lastChatAt ||
    o.lastChatAt;
  return {
    ...base,
    chat,
    ...(lastMemberChatAt ? { lastMemberChatAt } : {}),
    ...(lastTrainerChatAt ? { lastTrainerChatAt } : {}),
    ...(lastChatAt ? { lastChatAt } : {}),
  };
}
