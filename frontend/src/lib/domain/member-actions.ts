import type { Member } from "@/types";
import {
  isPaymentByPastDue,
  localCalendarDateKey,
  localTodayCalendarKey,
  overdueDaysForMember,
  paymentByDateKey,
} from "@/lib/domain/billing";

export type MemberMessageAction = {
  key: "none" | "fine" | "reminder" | "welcome" | "hold" | "deactivate";
  label: string;
  disabled: boolean;
  overdueDays?: number;
  reason?: string;
};

export type WhatsAppSendMeta = {
  sentAt: string;
  sentBy: string;
};

const DISPLAY_TIME_ZONES: Record<string, string> = {
  IST: "Asia/Kolkata",
  AEST: "Australia/Sydney",
};

const BILLING_CYCLE_TEMPLATE_KEYS = new Set(["reminder", "monthReminder"]);

function reminderSentForCurrentBilling(member: Member) {
  const billingKey = localCalendarDateKey(member.billingDate);
  if (!billingKey) return false;

  const last = member.lastSmsSent;
  if (last && typeof last === "object") {
    const reminder = (last as Record<string, { sentAt?: string; ts?: string }>).reminder;
    const sentAt = reminder?.sentAt || reminder?.ts || "";
    if (sentAt && shouldShowSmsSentBadge(member, "reminder", sentAt)) return true;
  }

  const history = Array.isArray(member.smsHistory) ? member.smsHistory : [];
  return history.some((entry) => {
    const row = entry as Record<string, unknown>;
    const type = String(row.type || row.key || row.template || "").toLowerCase();
    if (!type.includes("reminder")) return false;
    const at = localCalendarDateKey(String(row.at || row.sentAt || row.createdAt || ""));
    return Boolean(at && at >= billingKey);
  });
}

/** Production WhatsApp primary action for member list rows. */
export function primaryMessageActionForMember(
  member: Member | null | undefined,
  opts: { isOwner?: boolean; asOfKey?: string | null } = {},
): MemberMessageAction {
  if (!member) return { key: "none", label: "", disabled: true };
  const todayKey = opts.asOfKey || localTodayCalendarKey();
  const joiningKey = localCalendarDateKey(member.joiningDate);
  const billingKey = localCalendarDateKey(member.billingDate);
  const paymentByKey = paymentByDateKey(member);
  const paymentOverdue = isPaymentByPastDue(member, { asOfKey: todayKey });
  const overdueDays = overdueDaysForMember(member, todayKey);
  const sameJoinAndBillingDay = Boolean(joiningKey && billingKey && joiningKey === billingKey);

  if (member.status === "Active") {
    if (paymentOverdue) {
      return {
        key: "fine",
        label: "Fine SMS",
        disabled: false,
        overdueDays,
        reason: `Payment By ${paymentByKey} crossed.`,
      };
    }
    if (!paymentOverdue && sameJoinAndBillingDay && billingKey && billingKey <= todayKey) {
      return { key: "welcome", label: "Welcome SMS", disabled: false };
    }
    if (!paymentOverdue && billingKey && billingKey <= todayKey) {
      const reminderSent = reminderSentForCurrentBilling(member);
      return {
        key: "reminder",
        label: reminderSent ? "Reminder Sent" : "Reminder",
        disabled: reminderSent && !opts.isOwner,
      };
    }
    if (!paymentOverdue && joiningKey && joiningKey === todayKey) {
      return { key: "welcome", label: "Welcome SMS", disabled: false };
    }
    return { key: "none", label: "", disabled: true };
  }
  if (member.status === "Hold") return { key: "hold", label: "Hold SMS", disabled: false };
  if (member.status === "Deactivated") return { key: "deactivate", label: "Deactivate SMS", disabled: false };
  if (member.status === "Cancelled") return { key: "fine", label: "Fine SMS", disabled: false };
  return { key: "none", label: "", disabled: true };
}

export function isBillingToday(member: Member, asOfKey?: string | null) {
  const today = asOfKey || localTodayCalendarKey();
  const billing = localCalendarDateKey(member.billingDate);
  return Boolean(billing && today && billing === today);
}

export function isNewMember(member: Member, withinHours = 48) {
  const created = member.createdAt ? new Date(member.createdAt).getTime() : NaN;
  if (Number.isNaN(created)) return false;
  return Date.now() - created < withinHours * 3600_000;
}

export function shortStatus(status?: string | null) {
  const s = String(status || "");
  if (!s) return "—";
  return s.length > 10 ? `${s.slice(0, 4)}…` : s;
}

export function formatDateTimeTz(value?: string | Date | null, tz = "IST") {
  if (!value) return "";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const zone = DISPLAY_TIME_ZONES[tz] || DISPLAY_TIME_ZONES.IST;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: zone,
  }).format(dt);
}

/** Reminder/welcome chips only count sends in the current billing/join cycle. */
export function shouldShowSmsSentBadge(
  member: Member | null | undefined,
  templateKey: string,
  sentAt?: string | null,
) {
  const key = String(templateKey || "").trim();
  const sentKey = localCalendarDateKey(sentAt || "");
  if (!sentKey) return false;

  if (BILLING_CYCLE_TEMPLATE_KEYS.has(key)) {
    const billingKey = localCalendarDateKey(member?.billingDate || "");
    if (!billingKey) return true;
    return sentKey >= billingKey;
  }

  if (key === "welcome") {
    const anchorKey = localCalendarDateKey(member?.joiningDate || member?.billingDate || "");
    if (!anchorKey) return true;
    return sentKey >= anchorKey;
  }

  return true;
}

export function getLastWhatsAppSendMeta(
  member: Member | null | undefined,
  templateKey?: string | null,
): WhatsAppSendMeta | null {
  if (!member) return null;
  const history = Array.isArray(member.messageHistory)
    ? (member.messageHistory as Record<string, unknown>[])
    : [];

  if (!templateKey) {
    const entry = history.find(
      (ev) => ev && ev.channel === "whatsapp" && ev.status === "opened",
    );
    if (!entry) return null;
    return {
      sentAt: String(entry.sentAt || entry.ts || ""),
      sentBy: String(entry.sentBy || entry.by || ""),
    };
  }

  const candidates: { ms: number; sentAt: string; sentBy: string }[] = [];
  const pushCand = (sentAt?: unknown, sentBy?: unknown) => {
    const raw = String(sentAt || "").trim();
    if (!raw) return;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms)) return;
    candidates.push({ ms, sentAt: raw, sentBy: String(sentBy || "").trim() });
  };

  const last = member.lastSmsSent;
  if (last && typeof last === "object") {
    const d = (last as Record<string, { sentAt?: string; ts?: string; sentBy?: string; by?: string }>)[
      templateKey
    ];
    if (d && (d.sentAt || d.ts)) pushCand(d.sentAt || d.ts, d.sentBy || d.by);
  }

  for (const ev of history) {
    if (!ev || ev.channel !== "whatsapp" || ev.status !== "opened") continue;
    if (ev.templateKey !== templateKey) continue;
    if (ev.sentAt || ev.ts) pushCand(ev.sentAt || ev.ts, ev.sentBy || ev.by);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.ms - a.ms);
  const best = candidates[0];
  return { sentAt: best.sentAt, sentBy: best.sentBy };
}

/** Production chip text: "Sent 10 Jul 2026, 12:55 pm (IST) by Deep" */
export function getSmsSentInfoText(
  member: Member | null | undefined,
  templateKey?: string | null,
  tz = "IST",
) {
  if (!templateKey || templateKey === "none") return "";
  const meta = getLastWhatsAppSendMeta(member, templateKey);
  if (!meta?.sentAt) return "";
  if (!shouldShowSmsSentBadge(member, templateKey, meta.sentAt)) return "";
  const sentByNorm = String(meta.sentBy || "")
    .trim()
    .toLowerCase();
  if (sentByNorm === "owner") return "";
  const when = formatDateTimeTz(meta.sentAt, tz);
  if (!when) return "";
  return meta.sentBy ? `Sent ${when} (${tz}) by ${meta.sentBy}` : `Sent ${when} (${tz})`;
}
