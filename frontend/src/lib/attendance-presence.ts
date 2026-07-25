const PRESENCE_TICKET_KEY = "apg.attendancePresenceTicket";

export type PresenceTicketPayload = {
  ticket: string;
  gymCodeId?: string;
  expiresAt?: string;
};

export function storePresenceTicket(payload: PresenceTicketPayload) {
  if (typeof window === "undefined") return;
  const ticket = String(payload?.ticket || "").trim();
  if (!ticket) return;
  const value = JSON.stringify({
    ticket,
    gymCodeId: payload.gymCodeId ? String(payload.gymCodeId) : undefined,
    expiresAt: payload.expiresAt ? String(payload.expiresAt) : undefined,
    storedAt: new Date().toISOString(),
  });
  try {
    sessionStorage.setItem(PRESENCE_TICKET_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPresenceTicket(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PRESENCE_TICKET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PresenceTicketPayload & { storedAt?: string };
    const ticket = String(parsed?.ticket || "").trim();
    if (!ticket) return null;
    const expiresAt = parsed?.expiresAt ? Date.parse(String(parsed.expiresAt)) : NaN;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      clearPresenceTicket();
      return null;
    }
    return ticket;
  } catch {
    return null;
  }
}

export function clearPresenceTicket() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PRESENCE_TICKET_KEY);
  } catch {
    /* ignore */
  }
}
