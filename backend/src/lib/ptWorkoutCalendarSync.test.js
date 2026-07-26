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
