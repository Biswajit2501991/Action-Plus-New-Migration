import type { AuditLog } from "@/types";

/** Keep first occurrence of each log id (list order is newest-first). */
export function dedupeAuditLogs(logs: AuditLog[] | null | undefined): AuditLog[] {
  const list = Array.isArray(logs) ? logs : [];
  const seen = new Set<string>();
  const out: AuditLog[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const id = String(row?.id || "").trim();
    const key = id || `__idx-${i}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

const AUDIT_ACTION_LABEL_OVERRIDES: Record<string, string> = {
  "custom_template.created": "Custom template created",
  "custom_template.updated": "Custom template updated",
  "custom_template.archived": "Custom template archived",
  "custom_template.deleted": "Custom template deleted",
  "custom_template.sent": "Custom WhatsApp template sent",
  "member.updated": "Member updated",
  "member.created": "Member created",
  "member.deleted": "Member deleted",
  "status.changed": "Member status changed",
  "settings.updated": "Settings updated",
  "visitor.created": "Visitor created",
  "visitor.updated": "Visitor updated",
  "visitor.deleted": "Visitor deleted",
  "visitor.called": "Visitor call logged",
  "auth.login": "Sign in",
  "auth.logout": "Sign out",
  "auth.login.blocked": "Sign in blocked",
  "backup.exported": "Backup exported",
  "backup.imported": "Backup imported",
  "leave.requested": "Leave request submitted",
  "leave.status.updated": "Leave request status updated",
  "attendance.leave_synced": "Attendance (leave sync)",
  "staff.role_template.updated": "Role template updated",
  "staff.role_template.created": "Role template created",
  "staff.role_template.deleted": "Role template deleted",
  "staff.password.view_toggled": "Staff password visibility",
  "staff.block_toggled": "Staff block toggled",
  "staff.deleted": "Staff deleted",
  "staff.updated": "Staff updated",
  "staff.created": "Staff added",
  "staff.password_reset.requested": "Password reset requested",
  "staff.password_reset.approved": "Password reset approved",
  "staff.password_reset.rejected": "Password reset rejected",
  "staff.password_changed.self": "Password changed (self)",
  "member.payment.added": "Member payment added",
  "member.payment.edited": "Member payment edited",
  "member.payment.deleted": "Member payment deleted",
  "sms.status_triggered": "Auto SMS (status change)",
  "whatsapp.call.opened": "WhatsApp call/chat",
  "history.undo": "Undo",
  "history.redo": "Redo",
};

function humanizeDottedAction(action: string) {
  return String(action || "")
    .split(".")
    .map((seg) => seg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");
}

function smsTemplateLogLabel(key: string) {
  const map: Record<string, string> = {
    reminder: "Reminder",
    monthReminder: "Month reminder",
    success: "Success",
    fine: "Fine",
    deactivate: "Deactivate",
    hold: "Hold",
    welcome: "Welcome",
  };
  return map[key] || humanizeDottedAction(key);
}

export function formatAuditActionLabel(action?: string | null) {
  const act = String(action || "");
  const m = /^sms\.([a-zA-Z0-9_-]+)\.opened$/.exec(act);
  if (m) return `${smsTemplateLogLabel(m[1])} (WhatsApp)`;
  if (
    act === "welcome.whatsapp.opened" ||
    act === "sms.whatsapp.opened" ||
    act === "sms.send_now.opened"
  ) {
    return "WhatsApp (legacy)";
  }
  if (AUDIT_ACTION_LABEL_OVERRIDES[act]) return AUDIT_ACTION_LABEL_OVERRIDES[act];
  return humanizeDottedAction(act);
}

export function logTimestamp(entry: AuditLog | null | undefined) {
  return String(entry?.ts || entry?.createdAt || "");
}

export function logActor(entry: AuditLog | null | undefined) {
  return String(entry?.actor || entry?.actorName || entry?.actorId || "system");
}

export function flattenForDiff(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      const k = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      if (item && typeof item === "object") flattenForDiff(item, k, out);
      else out[k] = item;
    });
    return out;
  }
  if (typeof value === "object") {
    Object.keys(value as object).forEach((k) => {
      const next = prefix ? `${prefix}.${k}` : k;
      const v = (value as Record<string, unknown>)[k];
      if (v && typeof v === "object") flattenForDiff(v, next, out);
      else out[next] = v;
    });
    return out;
  }
  out[prefix || "value"] = value;
  return out;
}

export function getChangedFields(entry: AuditLog | null | undefined) {
  const beforeFlat = flattenForDiff(entry?.before || {});
  const afterFlat = flattenForDiff(entry?.after || {});
  const keys = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]));
  return keys
    .filter((k) => JSON.stringify(beforeFlat[k]) !== JSON.stringify(afterFlat[k]))
    .map((k) => ({ key: k, before: beforeFlat[k], after: afterFlat[k] }));
}

export function prettyDiffValue(v: unknown) {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v || '""';
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function logEntrySummary(l: AuditLog) {
  const a = (l.after || {}) as Record<string, unknown>;
  const b = (l.before || {}) as Record<string, unknown>;
  const act = String(l.action || "");
  const openedMatch = /^sms\.([a-zA-Z0-9_-]+)\.opened$/.exec(act);

  if (
    openedMatch ||
    act === "sms.whatsapp.opened" ||
    act === "welcome.whatsapp.opened" ||
    act === "sms.send_now.opened"
  ) {
    const parts = [];
    if (a.memberName) parts.push(String(a.memberName));
    if (a.templateLabel || a.templateKey) parts.push(String(a.templateLabel || a.templateKey));
    else if (openedMatch) parts.push(smsTemplateLogLabel(openedMatch[1]));
    if (a.source) parts.push(`via ${String(a.source).replace(/_/g, " ")}`);
    if (parts.length) return parts.join(" · ");
  }
  if (act === "sms.status_triggered") {
    const parts = [];
    if (a.memberName) parts.push(String(a.memberName));
    if (a.templateLabel || a.templateKey) parts.push(String(a.templateLabel || a.templateKey));
    if (a.fromStatus && a.toStatus) parts.push(`${a.fromStatus}→${a.toStatus}`);
    if (parts.length) return parts.join(" · ");
  }
  if (act === "whatsapp.call.opened") {
    const parts = [];
    if (a.memberName) parts.push(String(a.memberName));
    if (a.calledBy) parts.push(`by ${a.calledBy}`);
    if (parts.length) return parts.join(" · ");
  }
  if (act === "member.created") {
    return [a.name, a.memberId || l.entityId, "new member"].filter(Boolean).join(" · ");
  }
  if (act === "member.deleted") {
    return [a.name || b.name || "Member", l.entityId || a.memberId || ""].filter(Boolean).join(" · ");
  }
  if (act === "member.updated") {
    const name = a.name || b.name || "";
    const ch = getChangedFields(l);
    const heavy = (k: string) =>
      k.startsWith("messageHistory") || k.startsWith("paymentHistory") || k === "photo";
    const light = ch.filter((c) => !heavy(c.key));
    const labels = light
      .slice(0, 8)
      .map((c) => (c.key.includes(".") ? c.key.replace(/^[^.]*\./, "") : c.key));
    const more = light.length > 8 ? "…" : "";
    return [name, labels.length ? `${light.length} field(s): ${labels.join(", ")}${more}` : "record saved"]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "status.changed") {
    return [a.name || b.name, b.status && a.status ? `${b.status}→${a.status}` : a.status || b.status]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "member.payment.added") {
    const amount = Number(a.amount || 0);
    return [
      a.memberName || l.entityId,
      amount > 0 ? `₹${amount.toLocaleString()}` : "",
      a.paidAt ? String(a.paidAt).slice(0, 10) : "",
      a.method || "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "settings.updated") {
    const key = l.entityId || "";
    if (key.startsWith("ptClientProfiles:")) {
      const memberCode = key.slice("ptClientProfiles:".length);
      const focus = a.focusArea || b.focusArea || "";
      return [`PT client ${memberCode}`, focus].filter(Boolean).join(" · ");
    }
    return key ? `Setting “${key}”` : "Settings";
  }
  if (act === "visitor.created" || act === "visitor.updated") {
    return [a.name || a.email || l.entityId, a.mobile && `${a.mobile}`].filter(Boolean).join(" · ");
  }
  if (act === "visitor.deleted") {
    return [b.name || b.email || "Visitor", "removed"].filter(Boolean).join(" · ");
  }
  if (act === "visitor.called") {
    return [a.name || b.name, "marked called"].filter(Boolean).join(" · ");
  }
  if (act === "auth.login") return a.id ? `User ${a.id}` : "Sign in";
  if (act === "auth.login.blocked") return a.id ? `Blocked: ${a.id}` : "Sign in blocked";
  if (act === "auth.logout") return b.id || a.id ? `User ${b.id || a.id}` : "Sign out";
  if (act === "backup.exported") return "Local backup file";
  if (act === "backup.imported") {
    return `Imported · ${Number(a.members || 0)} members, ${Number(a.users || 0)} users`;
  }
  if (act === "leave.requested") {
    const reason = String(a.reason || "");
    const rsn = reason
      ? `“${reason.slice(0, 36)}${reason.length > 36 ? "…" : ""}”`
      : "";
    return [`${a.startDate || "?"}→${a.endDate || "?"}`, `${a.days || "?"} days`, rsn]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "leave.status.updated") {
    return [
      a.userId && `staff ${a.userId}`,
      a.status || b.status,
      a.startDate && `${a.startDate}→${a.endDate || ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "attendance.leave_synced") {
    return [
      `User ${l.entityId || ""}`,
      `${a.syncedDays ?? 0} day(s) synced`,
      a.startDate && `${a.startDate}→${a.endDate || ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "staff.created" || act === "staff.updated") {
    return [a.name || b.name || l.entityId, a.id || b.id || l.entityId].filter(Boolean).join(" · ");
  }
  if (act === "staff.deleted") {
    return [b.name || a.name || l.entityId, "removed"].filter(Boolean).join(" · ");
  }
  if (act === "staff.block_toggled") {
    const blk = a.blocked != null ? a.blocked : b.blocked;
    return [a.name || b.name || l.entityId, blk ? "blocked" : "unblocked"].filter(Boolean).join(" · ");
  }
  if (act === "staff.password.view_toggled") {
    return [l.entityId, a.shown ? "password shown" : "password hidden"].filter(Boolean).join(" · ");
  }
  if (act === "staff.password_reset.requested") {
    return [
      a.staffName || a.staffId || l.entityId,
      `requested by ${a.requestedByLogin || "login page"}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "staff.password_reset.approved") {
    return [a.staffName || a.staffId || l.entityId, `approved by ${a.approvedBy || "owner"}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "staff.password_reset.rejected") {
    return [a.staffName || a.staffId || l.entityId, `rejected by ${a.rejectedBy || "owner"}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (act === "staff.password_changed.self") {
    return [a.staffName || a.staffId || l.entityId, "self changed password"]
      .filter(Boolean)
      .join(" · ");
  }
  if (
    act === "staff.role_template.created" ||
    act === "staff.role_template.updated" ||
    act === "staff.role_template.deleted"
  ) {
    return [a.title || b.title || a.id || b.id || l.entityId].filter(Boolean).join(" · ");
  }
  if (act === "history.undo" || act === "history.redo") {
    const step = a.step != null ? a.step : b.step;
    return [act === "history.undo" ? "Undo" : "Redo", step != null && `step ${step}`]
      .filter(Boolean)
      .join(" · ");
  }

  const changes = getChangedFields(l);
  if (!changes.length) {
    if (l.after && typeof l.after === "object" && Object.keys(l.after).length) {
      return Object.entries(l.after)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : String(v)}`)
        .slice(0, 5)
        .join(" · ");
    }
    return "";
  }
  return `${changes.length} changed: ${changes
    .slice(0, 3)
    .map((c) => c.key)
    .join(", ")}${changes.length > 3 ? "…" : ""}`;
}

export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
