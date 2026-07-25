import { isRecordNewWithinHours } from "@/lib/domain/new-record";
import type { Visitor } from "@/types";

/** Visitors that should alert every staff until any one of them acknowledges. */
export function pendingNewVisitorAlerts(
  visitors: Visitor[],
  options?: { hours?: number; limit?: number },
): Visitor[] {
  const hours = options?.hours ?? 72;
  const limit = options?.limit ?? 20;
  return visitors
    .filter((v) => {
      if (String(v.status || "") === "Converted") return false;
      if (v.staffSeenAt) return false;
      return isRecordNewWithinHours(String(v.addedAt || v.visitDate || ""), hours);
    })
    .sort((a, b) => {
      const aMs = new Date(String(a.addedAt || a.visitDate || 0)).getTime() || 0;
      const bMs = new Date(String(b.addedAt || b.visitDate || 0)).getTime() || 0;
      return bMs - aMs;
    })
    .slice(0, limit);
}

export function withStaffSeenAck(visitor: Visitor, actor: string): Visitor {
  return {
    ...visitor,
    staffSeenAt: new Date().toISOString(),
    staffSeenBy: String(actor || "").trim() || "staff",
    updatedAt: new Date().toISOString(),
  };
}
