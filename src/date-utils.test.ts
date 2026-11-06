import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateFromKey,
  dateKey,
  localDateTimeToISO,
  localParts,
  monthDates,
  shiftDate,
  shiftMonth,
} from "./date-utils.js";
import { weekNavigationLabel } from "./calendar-layout.js";

test("month grid starts on Monday and includes leap day and adjacent months", () => {
  const grid = monthDates("2028-02-15");
  assert.equal(grid.length, 42);
  assert.equal(dateFromKey(grid[0]).getDay(), 1);
  assert.ok(grid.includes("2028-02-29"));
  assert.equal(grid[0], "2028-01-31");
  assert.equal(grid.at(-1), "2028-03-12");
});
test("month navigation clamps month-end and date navigation crosses year boundaries", () => {
  assert.equal(shiftMonth("2028-01-31", 1), "2028-02-29");
  assert.equal(shiftMonth("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
});
test("separate date and time fields preserve device-local values and cross-day events", () => {
  const start = localDateTimeToISO("2026-11-06", "23:30");
  const end = localDateTimeToISO("2026-11-07", "00:30");
  assert.deepEqual(localParts(start), { date: "2026-11-06", time: "23:30" });
  assert.equal(dateKey(new Date(end)), "2026-11-07");
  assert.equal(Date.parse(end) - Date.parse(start), 3600000);
  for (const [date, time] of [
    ["", "08:00"],
    ["2026-02-30", "08:00"],
    ["2026-11-06", "24:00"],
    ["2026-11-06", ""],
  ])
    assert.throws(() => localDateTimeToISO(date, time));
});
test("week switch label follows selected week with and without a semester", () => {
  assert.equal(
    weekNavigationLabel("2026-08-31", "2026-11-06", "2026-11-06"),
    "本周",
  );
  assert.equal(
    weekNavigationLabel("2026-08-31", "2026-11-13", "2026-11-06"),
    "第11周",
  );
  assert.equal(weekNavigationLabel(null, "2026-11-13", "2026-11-06"), "下周");
  assert.equal(weekNavigationLabel(null, "2026-10-30", "2026-11-06"), "上周");
  assert.equal(weekNavigationLabel(null, "2026-11-20", "2026-11-06"), "2周后");
  assert.equal(
    weekNavigationLabel("2026-08-31", "2026-08-23", "2026-11-06"),
    "开学前",
  );
});
