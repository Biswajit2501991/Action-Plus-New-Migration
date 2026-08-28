import { describe, expect, it } from "vitest";
import { mergeFocusIntoByDate } from "./ptWorkoutCalendarSync.js";

describe("mergeFocusIntoByDate", () => {
  it("adds focus days that are missing from daily logs", () => {
    const merged = mergeFocusIntoByDate(
      { "2026-07-01": { exercises: ["Back"], notes: "" } },
      { "2026-07-01": "Chest", "2026-07-02": "Legs" },
    );
    expect(merged["2026-07-01"].exercises).toEqual(["Back"]);
    expect(merged["2026-07-02"].exercises).toEqual(["Legs"]);
    expect(merged["2026-07-02"].source).toBe("pt_schedule");
  });

  it("does not overwrite notes-only days exercises when focus present", () => {
    const merged = mergeFocusIntoByDate(
      { "2026-07-03": { exercises: [], notes: "sore knee" } },
      { "2026-07-03": "Chest" },
    );
    expect(merged["2026-07-03"].exercises).toEqual(["Chest"]);
    expect(merged["2026-07-03"].notes).toBe("sore knee");
  });
});

describe("focusLabel helpers via merge gap-fill semantics", () => {
  it("keeps existing daily exercises when focus also exists", () => {
    const merged = mergeFocusIntoByDate(
      {
        "2026-07-13": { exercises: ["PT"], notes: "" },
        "2026-07-14": { exercises: [], notes: "rest" },
      },
      { "2026-07-13": "Legs", "2026-07-14": "Arms" },
    );
    expect(merged["2026-07-13"].exercises).toEqual(["PT"]);
    expect(merged["2026-07-14"].exercises).toEqual(["Arms"]);
  });
});
