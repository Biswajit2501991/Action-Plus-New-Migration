import { describe, expect, it } from "vitest";

// Mirror clamp helpers (Website TS) for quick unit coverage without Next bundling.
function clampBroadcastTitle(raw, max = 120) {
  return String(raw || "").trim().slice(0, max);
}
function clampBroadcastBody(raw, max = 500) {
  return String(raw || "").trim().slice(0, max);
}

describe("owner push broadcast clamps", () => {
  it("trims and caps title/body", () => {
    expect(clampBroadcastTitle("  Hello  ")).toBe("Hello");
    expect(clampBroadcastTitle("x".repeat(200)).length).toBe(120);
    expect(clampBroadcastBody("  Body  ")).toBe("Body");
    expect(clampBroadcastBody("y".repeat(600)).length).toBe(500);
  });

  it("rejects empty after trim", () => {
    expect(clampBroadcastTitle("   ")).toBe("");
    expect(clampBroadcastBody("\n")).toBe("");
  });
});
