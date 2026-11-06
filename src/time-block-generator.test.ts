import { test } from "node:test";
import assert from "node:assert/strict";
import {
  automaticEnd,
  generateTimeBlocks,
  nextTimeBlock,
} from "./time-block-generator.js";

const defaults = {
  firstStart: "08:30",
  lessonMinutes: 45,
  breakMinutes: 10,
  morningCount: 4,
  afternoonCount: 4,
  eveningCount: 2,
  middayBreakMinutes: 120,
  eveningBreakMinutes: 90,
};
test("start-time edits and next-period defaults produce 45-minute lessons and 10-minute breaks", () => {
  assert.equal(automaticEnd("08:30"), "09:15");
  assert.equal(automaticEnd("08:00"), "08:45");
  const next = nextTimeBlock(
    [{ id: "one", label: "第1节", startTime: "08:30", endTime: "09:15" }],
    defaults,
  );
  assert.deepEqual(next, {
    label: "第2节",
    startTime: "09:25",
    endTime: "10:10",
  });
});
test("bulk generation honors session counts and leaves lunch and evening gaps", () => {
  const rows = generateTimeBlocks(defaults);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].startTime, "08:30");
  assert.equal(rows[3].endTime, "12:00");
  assert.equal(rows[4].startTime, "14:00");
  assert.equal(rows[7].endTime, "17:30");
  assert.equal(rows[8].startTime, "19:00");
  assert.equal(rows[9].endTime, "20:40");
});
test("custom lesson lengths and empty sessions use the entered daily first lesson", () => {
  const rows = generateTimeBlocks({
    ...defaults,
    firstStart: "14:10",
    lessonMinutes: 50,
    morningCount: 0,
    afternoonCount: 2,
    eveningCount: 0,
  });
  assert.deepEqual(
    rows.map((row) => [row.startTime, row.endTime]),
    [
      ["14:10", "15:00"],
      ["15:10", "16:00"],
    ],
  );
});
test("generation rejects excessive counts, missing rests and midnight overflow", () => {
  assert.throws(() => generateTimeBlocks({ ...defaults, morningCount: 25 }));
  assert.throws(() =>
    generateTimeBlocks({
      ...defaults,
      morningCount: 0,
      afternoonCount: 0,
      eveningCount: 0,
    }),
  );
  assert.throws(() =>
    generateTimeBlocks({ ...defaults, middayBreakMinutes: Number.NaN }),
  );
  assert.throws(() =>
    generateTimeBlocks({
      ...defaults,
      firstStart: "23:30",
      morningCount: 1,
      afternoonCount: 0,
      eveningCount: 0,
    }),
  );
  assert.throws(() => automaticEnd("23:30", 45));
});
test("user-entered rests determine session starts without an extra lesson break", () => {
  const rows = generateTimeBlocks({
    ...defaults,
    middayBreakMinutes: 80,
    eveningBreakMinutes: 60,
  });
  assert.equal(rows[4].startTime, "13:20");
  assert.equal(rows[7].endTime, "16:50");
  assert.equal(rows[8].startTime, "17:50");
  const skipped = generateTimeBlocks({
    ...defaults,
    morningCount: 1,
    afternoonCount: 0,
    eveningCount: 1,
    middayBreakMinutes: Number.NaN,
    eveningBreakMinutes: 30,
  });
  assert.equal(skipped[1].startTime, "09:45");
  assert.throws(() =>
    generateTimeBlocks({ ...defaults, eveningBreakMinutes: -1 }),
  );
  assert.throws(() =>
    generateTimeBlocks({ ...defaults, middayBreakMinutes: 720 }),
  );
});
test("adding a period does not wrap back or silently shorten at the end of the day", () => {
  assert.throws(() =>
    nextTimeBlock(
      [{ id: "last", label: "最后", startTime: "23:00", endTime: "23:45" }],
      defaults,
    ),
  );
});
