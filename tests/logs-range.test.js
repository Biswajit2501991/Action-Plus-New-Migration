import { describe, expect, it } from "vitest";
import {
  defaultLogsFetchRange,
  logsRangeSpanDays,
  resolveLogsFetchRange,
  validateLogsCustomRange,
} from "../frontend/src/lib/domain/logs-range.ts";

describe("logs range helpers", () => {
  it("defaults to a 7 calendar-day inclusive window", () => {
    const range = defaultLogsFetchRange(new Date(2026, 8, 4, 12, 0, 0));
    expect(range.preset).toBe("7d");
    expect(range.endDate).toBe("2026-09-04");
    expect(range.startDate).toBe("2026-08-29");
    expect(logsRangeSpanDays(range.startDate, range.endDate)).toBe(7);
  });

  it("resolves 24h as rolling ISO timestamps", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    const range = resolveLogsFetchRange("24h", undefined, now);
    expect(range.preset).toBe("24h");
    expect(range.endDate).toBe(now.toISOString());
    expect(new Date(range.startDate).getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000);
  });

  it("validates custom ranges and max span", () => {
    expect(validateLogsCustomRange("2026-09-10", "2026-09-01")).toMatch(/before/i);
    expect(validateLogsCustomRange("2026-01-01", "2026-06-01")).toMatch(/90/);
    expect(validateLogsCustomRange("2026-09-01", "2026-09-10")).toBe(null);
  });
});
