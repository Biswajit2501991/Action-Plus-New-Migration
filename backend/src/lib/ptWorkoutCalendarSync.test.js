import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeFocusIntoByDate } from "./ptWorkoutCalendarSync.js";

describe("mergeFocusIntoByDate", () => {
  it("adds focus days that are missing from daily logs", () => {
    const merged = mergeFocusIntoByDate(
      { "2026-07-01": { exercises: ["Back"], notes: "" } },
      { "2026-07-01": "Chest", "2026-07-02": "Legs" },
    );
    assert.deepEqual(merged["2026-07-01"].exercises, ["Back"]);
    assert.deepEqual(merged["2026-07-02"].exercises, ["Legs"]);
    assert.equal(merged["2026-07-02"].source, "pt_schedule");
  });

  it("does not overwrite notes-only days exercises when focus present", () => {
    const merged = mergeFocusIntoByDate(
      { "2026-07-03": { exercises: [], notes: "sore knee" } },
      { "2026-07-03": "Chest" },
    );
    assert.deepEqual(merged["2026-07-03"].exercises, ["Chest"]);
    assert.equal(merged["2026-07-03"].notes, "sore knee");
  });
});

describe("focusLabel helpers via merge gap-fill semantics", () => {
  it("keeps existing daily exercises when focus also exists", () => {
    const merged = mergeFocusIntoByDate(
      {
        "2026-07-13": { exercises: ["PT"], notes: "" },
        "2026-07-25": { exercises: [], notes: "rest note" },
      },
      { "2026-07-14": "Chest" },
    );
    assert.deepEqual(merged["2026-07-13"].exercises, ["PT"]);
    assert.deepEqual(merged["2026-07-14"].exercises, ["Chest"]);
    assert.equal(merged["2026-07-25"].notes, "rest note");
  });
});
