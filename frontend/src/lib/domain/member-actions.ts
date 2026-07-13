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

function reminderSentForCurrentBilling(member: Member) {
  const billingKey = localCalendarDateKey(member.billingDate);
  if (!billingKey) return false;
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
