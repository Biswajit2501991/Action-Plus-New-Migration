import { describe, expect, it } from "vitest";

function normalizeInclusions(input) {
  if (!Array.isArray(input)) {
    if (typeof input === "string") {
      return input
        .split("\n")
        .map((s) => s.replace(/^[-•*\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 40);
    }
    return [];
  }
  return input
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

describe("membership plan catalog helpers", () => {
  it("parses inclusion bullets from multiline text", () => {
    expect(
      normalizeInclusions("- Gym floor\n• Locker\n  PT sessions"),
    ).toEqual(["Gym floor", "Locker", "PT sessions"]);
  });

  it("caps inclusion count", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
    expect(normalizeInclusions(many)).toHaveLength(40);
  });
});
