import type { Member } from "@/types";
import { paymentByDateKey, localCalendarDateKey, localTodayCalendarKey } from "@/lib/domain/billing";
import { nextPaymentDateFromBillingDate } from "@/lib/domain/member-dates";
import {
  getLastWhatsAppSendMeta,
  primaryMessageActionForMember,
} from "@/lib/domain/member-actions";
import { formatDate } from "@/lib/utils";
import { formatMemberBirthday, birthdaysToday } from "@/lib/domain/members";
import {
  SMS_TEMPLATE_DEFAULTS,
  WHATSAPP_TEMPLATE_KEYS,
  type WhatsAppTemplateKey,
} from "@/lib/domain/whatsapp-templates";
import {
  formatReminderAmountWithReferralCredit,
  paymentAmountWithReferralCredit,
  templateUsesReferralCreditInAmount,
} from "@/lib/domain/referral-billing";

const MESSAGE_HISTORY_LIMIT = 50;

export type WhatsAppComposeResult = {
  templateKey: string;
  message: string;
  phone: string;
  url: string;
};

function displayDate(value?: string | Date | null) {
  if (!value) return "";
  const key = localCalendarDateKey(value);
  if (key) {
    const [y, m, d] = key.split("-").map(Number);
    return formatDate(new Date(y, m - 1, d));
  }
  return formatDate(value);
}

function formatSuccessSystemTimestamp(at: Date, tz = "Asia/Kolkata") {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(at);
  } catch {
    return at.toLocaleString("en-IN");
  }
}

export function mergeWhatsappTemplates(
  apiTemplates?: Record<string, unknown> | null,
): Record<string, string> {
  const merged: Record<string, string> = { ...SMS_TEMPLATE_DEFAULTS };
  if (!apiTemplates || typeof apiTemplates !== "object") return merged;
  for (const [key, value] of Object.entries(apiTemplates)) {
    if (typeof value === "string" && value.trim()) merged[key] = value;
    else if (value && typeof value === "object" && typeof (value as { body?: string }).body === "string") {
      const body = String((value as { body?: string }).body || "").trim();
      if (body) merged[key] = body;
    }
  }
  return merged;
}

export function resolveWhatsappTemplateBody(
  templateKey: string,
  templates: Record<string, string>,
): string {
  const key = String(templateKey || "").trim();
  if (!key) return templates.reminder || SMS_TEMPLATE_DEFAULTS.reminder || "";
  return templates[key] || templates.reminder || SMS_TEMPLATE_DEFAULTS.reminder || "";
}

export function renderWhatsappTemplate(
  template: string,
  member: Member | null | undefined,
  opts: {
    templateKey?: string;
    now?: Date;
    timeZone?: string;
    pendingReferralCreditInr?: number;
  } = {},
): string {
  if (!template) return "";
  const m = member || ({} as Member);
  const now = opts.now || new Date();
  const billingKey = localCalendarDateKey(m.billingDate);
  const paymentByKey = paymentByDateKey(m);
  const nextPay =
    localCalendarDateKey(m.nextPaymentDate) ||
    nextPaymentDateFromBillingDate(m.billingDate);
  const planAmount = Number(m.amount || 0);
  const pendingCredit = Math.max(0, Number(opts.pendingReferralCreditInr) || 0);
  const amountText =
    templateUsesReferralCreditInAmount(opts.templateKey) && pendingCredit > 0
      ? formatReminderAmountWithReferralCredit(planAmount, pendingCredit)
      : `${planAmount}`;
  const totalAmountWithFine = planAmount + 100;
  const replacements: Record<string, string> = {
    "[Name]": m.name || "",
    "[CustomerName]": m.name || "",
    "[BirthdayDate]": formatMemberBirthday(m.dob),
    "[PLAN]": m.plan || "",
    "[CurrentPlan]": m.plan || "",
    "[Amount]": amountText,
    "[BillingDate]": displayDate(billingKey || m.billingDate),
    "[DATE]": displayDate(billingKey || m.billingDate),
    "[GymStartdate]": displayDate(m.joiningDate),
    "[LastDate]": displayDate(paymentByKey),
    "[PaymentBy]": displayDate(paymentByKey),
    "[Total Amount]": `${totalAmountWithFine}`,
    "[HoldDate]": displayDate(now),
    "[HoldMonth]": m.holdDuration || "1 Month",
    "[TodaysDate]": displayDate(now),
    "[NextBillingDate]": displayDate(
      billingKey ? nextPaymentDateFromBillingDate(billingKey) : "",
    ),
    "[NextPaymentDate]": displayDate(nextPay),
    "[ModeOfPayment]": String(m.paymentMethod || ""),
    "[PaymentMethod]": String(m.paymentMethod || ""),
    "[SystemDetails]":
      opts.templateKey === "success"
        ? formatSuccessSystemTimestamp(now, opts.timeZone || "Asia/Kolkata")
        : "",
  };
  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}

export function formatWhatsAppPhone(mobile?: string | null) {
  const clean = String(mobile || "").replace(/\D/g, "");
  if (!clean) return "";
  return clean.length === 10 ? `91${clean}` : clean;
}

export function buildWhatsAppSendUrl(mobile: string | null | undefined, message: string) {
  const phone = formatWhatsAppPhone(mobile);
  if (!phone) return "";
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message || "")}`;
}

/** Prod: open chat for call (whatsapp://call is unreliable on desktop). */
export function buildWhatsAppCallUrl(mobile?: string | null) {
  const phone = formatWhatsAppPhone(mobile);
  if (!phone) return "";
  return `https://api.whatsapp.com/send?phone=${phone}`;
}

export function buildWhatsAppCallMemberPatch(
  member: Member,
  opts: { calledAt?: string; calledBy?: string } = {},
) {
  const calledAt = opts.calledAt || new Date().toISOString();
  const calledBy = opts.calledBy || "Staff";
  const history = Array.isArray(member.messageHistory) ? member.messageHistory : [];
  return {
    lastWhatsAppCall: { calledAt, calledBy },
    messageHistory: [
      {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `call-${Date.now()}`,
        channel: "whatsapp_call",
        templateKey: "call",
        status: "opened",
        ts: calledAt,
        calledAt,
        calledBy,
      },
      ...history,
    ].slice(0, MESSAGE_HISTORY_LIMIT),
  };
}

export function buildWhatsAppCallSmsEvent(
  member: Member,
  opts: { callUrl: string; calledAt?: string; calledBy?: string },
) {
  const calledAt = opts.calledAt || new Date().toISOString();
  const calledBy = opts.calledBy || "Staff";
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sms-${Date.now()}`,
    memberId: member.memberId,
    memberName: member.name || "",
    fromStatus: member.status || "",
    toStatus: member.status || "",
    templateKey: "whatsapp_call",
    message: `WhatsApp call/chat opened by ${calledBy}`,
    waUrl: opts.callUrl,
    ts: calledAt,
  };
}

export function composeWhatsAppMessage(
  member: Member,
  templateKey: string,
  templates: Record<string, string>,
  opts: {
    now?: Date;
    timeZone?: string;
    customBody?: string;
    pendingReferralCreditInr?: number;
  } = {},
): WhatsAppComposeResult {
  const key = String(templateKey || "reminder").trim() || "reminder";
  const body = String(opts.customBody || "").trim()
    ? String(opts.customBody)
    : resolveWhatsappTemplateBody(key, templates);
  const message = renderWhatsappTemplate(body, member, {
    templateKey: key,
    now: opts.now,
    timeZone: opts.timeZone,
    pendingReferralCreditInr: opts.pendingReferralCreditInr,
  });
  const phone = formatWhatsAppPhone(member.mobile);
  const url = buildWhatsAppSendUrl(member.mobile, message);
  return { templateKey: key, message, phone, url };
}

function buildHistoryEntry(
  templateKey: string,
  meta: {
    sentAt: string;
    sentBy: string;
    status?: string;
    reason?: string;
    channel?: string;
  },
) {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `msg-${Date.now()}`,
    channel: meta.channel || "whatsapp",
    templateKey,
    status: meta.status || "opened",
    ts: meta.sentAt,
    sentAt: meta.sentAt,
    sentBy: meta.sentBy,
    ...(meta.reason ? { reason: meta.reason } : {}),
  };
}

export function buildWhatsAppSendMemberPatch(
  member: Member,
  templateKey: string,
  meta: {
    sentAt?: string;
    sentBy?: string;
    referralCreditAppliedInr?: number;
    planAmountInr?: number;
    billedAmountInr?: number;
  } = {},
): Partial<Member> {
  const sentAt = String(meta.sentAt || new Date().toISOString());
  const sentBy = String(meta.sentBy || "").trim() || "Staff";
  const history = Array.isArray(member.messageHistory) ? member.messageHistory : [];
  const prevLast =
    member.lastSmsSent && typeof member.lastSmsSent === "object" ? member.lastSmsSent : {};
  const credit = Math.max(0, Number(meta.referralCreditAppliedInr) || 0);
  const planAmount =
    meta.planAmountInr != null
      ? Math.max(0, Number(meta.planAmountInr) || 0)
      : Math.max(0, Number(member.amount) || 0);
  const billedAmount =
    meta.billedAmountInr != null
      ? Math.max(0, Number(meta.billedAmountInr) || 0)
      : credit > 0
        ? paymentAmountWithReferralCredit(planAmount, credit)
        : planAmount;
  const lastEntry: Record<string, unknown> = { sentAt, sentBy };
  if (credit > 0 && templateUsesReferralCreditInAmount(templateKey)) {
    lastEntry.referralCreditAppliedInr = credit;
    lastEntry.planAmountInr = planAmount;
    lastEntry.billedAmountInr = billedAmount;
  }
  const patch: Partial<Member> & { reminderSentAt?: string } = {
    updatedAt: sentAt,
    lastSmsSent: {
      ...prevLast,
      [templateKey]: lastEntry,
    },
    messageHistory: [
      buildHistoryEntry(templateKey, { sentAt, sentBy }),
      ...history,
    ].slice(0, MESSAGE_HISTORY_LIMIT),
  };
  if (templateKey === "reminder") {
    patch.reminderSentAt = sentAt;
  }
  return patch;
}

/**
 * After a reminder applied referral credit, Payment Entry should still default
 * to the net amount shown in the SMS until a newer payment is recorded.
 */
export function reminderReferralCollectAmount(member: Member | null | undefined): number {
  if (!member) return 0;
  const lastSms =
    member.lastSmsSent && typeof member.lastSmsSent === "object" ? member.lastSmsSent : null;
  if (!lastSms) return 0;

  const candidates = [lastSms.reminder, lastSms.monthReminder].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"),
  );
  let best: { sentMs: number; credit: number; billed: number; plan: number } | null = null;
  for (const last of candidates) {
    const credit = Math.max(0, Number(last.referralCreditAppliedInr) || 0);
    if (credit <= 0) continue;
    const sentAt = String(last.sentAt || "").trim();
    if (!sentAt) continue;
    const sentMs = new Date(sentAt).getTime();
    if (!Number.isFinite(sentMs)) continue;
    const billedRaw = Number(last.billedAmountInr);
    const plan = Math.max(0, Number(last.planAmountInr ?? member.amount) || 0);
    const billed =
      Number.isFinite(billedRaw) && billedRaw > 0
        ? billedRaw
        : paymentAmountWithReferralCredit(plan, credit);
    if (!best || sentMs > best.sentMs) {
      best = { sentMs, credit, billed, plan };
    }
  }
  if (!best) return 0;

  const history = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  for (const p of history) {
    const payRaw = String(p?.paidAt || p?.paid_at || "").trim();
    if (!payRaw) continue;
    const payMs = new Date(payRaw).getTime();
    if (Number.isFinite(payMs) && payMs >= best.sentMs) return 0;
  }
  return best.billed;
}

export function buildWhatsAppMissingPhonePatch(
  member: Member,
  templateKey: string,
): Partial<Member> {
  const ts = new Date().toISOString();
  const history = Array.isArray(member.messageHistory) ? member.messageHistory : [];
  return {
    messageHistory: [
      buildHistoryEntry(templateKey, {
        sentAt: ts,
        sentBy: "",
        status: "failed",
        reason: "missing_phone",
      }),
      ...history,
    ].slice(0, MESSAGE_HISTORY_LIMIT),
  };
}

export function whatsappSendAuditAction(templateKey: string) {
  const raw = String(templateKey || "unknown").trim() || "unknown";
  if (raw.startsWith("custom:")) {
    const code = raw.slice("custom:".length).replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
    return `custom_template.sent.${code}`;
  }
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `sms.${safe}.opened`;
}

export function smsTypeLabel(key: string) {
  const map: Record<string, string> = {
    reminder: "Reminder",
    monthReminder: "Month Reminder",
    success: "Success SMS",
    fine: "Fine SMS",
    deactivate: "Deactivate SMS",
    hold: "Hold SMS",
    welcome: "Welcome SMS",
    birthday: "Birthday SMS",
  };
  if (map[key]) return map[key];
  if (key.startsWith("custom:")) {
    const code = key.slice("custom:".length).trim();
    return code
      ? code
          .split("_")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Custom Template";
  }
  return key;
}

/** Members eligible for each Messaging Center tab (prod parity). */
export function membersByWhatsAppType(
  members: Member[],
  opts: {
    isOwner?: boolean;
    settings?: {
      fineSmsEnabled?: boolean;
      fineSmsGraceDays?: number;
      fineSmsImmediateRoles?: string[];
    } | null;
    actorRole?: string | null;
  } = {},
): Record<WhatsAppTemplateKey, Member[]> {
  const todayKey = localTodayCalendarKey();
  const active = members.filter((m) => m.status === "Active");
  const actionOpts = {
    isOwner: opts.isOwner,
    settings: opts.settings,
    actorRole: opts.actorRole,
  };
  const primaryKey = (m: Member) => primaryMessageActionForMember(m, actionOpts).key;

  const sameMonthBilling = (m: Member) => {
    const billing = localCalendarDateKey(m.billingDate);
    if (!billing || !todayKey) return false;
    return billing.slice(0, 7) === todayKey.slice(0, 7);
  };

  return {
    reminder: active.filter((m) => primaryKey(m) === "reminder"),
    monthReminder: active.filter(sameMonthBilling),
    fine: active.filter((m) => primaryKey(m) === "fine"),
    success: members
      .filter((m) => Boolean(getLastWhatsAppSendMeta(m, "success")?.sentAt))
      .sort((a, b) => {
        const aTs = new Date(getLastWhatsAppSendMeta(a, "success")?.sentAt || 0).getTime();
        const bTs = new Date(getLastWhatsAppSendMeta(b, "success")?.sentAt || 0).getTime();
        return bTs - aTs;
      }),
    deactivate: members.filter((m) => m.status === "Deactivated"),
    hold: members.filter((m) => m.status === "Hold"),
    welcome: active.filter((m) => {
      const join = localCalendarDateKey(m.joiningDate);
      const billing = localCalendarDateKey(m.billingDate);
      return Boolean(join && billing && join === billing && billing <= todayKey);
    }),
    birthday: birthdaysToday(members),
  };
}

export function isWhatsAppTemplateKey(key: string): key is WhatsAppTemplateKey {
  return (WHATSAPP_TEMPLATE_KEYS as readonly string[]).includes(key);
}

export function suggestionToneClasses(key: string) {
  if (key === "fine") {
    return "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/80";
  }
  if (key === "welcome") {
    return "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-950/80";
  }
  if (key === "hold") {
    return "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-950/50 dark:text-orange-200 dark:hover:bg-orange-950/80";
  }
  if (key === "deactivate") {
    return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:hover:bg-fuchsia-950/80";
  }
  if (key === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950/80";
  }
  if (key === "birthday") {
    return "border-pink-300 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:border-pink-500/30 dark:bg-pink-950/50 dark:text-pink-200 dark:hover:bg-pink-950/80";
  }
  return "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-950/80";
}
