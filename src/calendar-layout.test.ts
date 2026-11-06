import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimeline, toMinute } from "./calendar-layout.js";

const blocks = [
  { id: "first", label: "第1节", startTime: "08:00", endTime: "08:45" },
  { id: "second", label: "第2节", startTime: "08:55", endTime: "09:40" },
];
test("periods start with the first lesson, with no unused midnight hours", () => {
  const result = createTimeline(blocks, []);
  assert.equal(result.segments[0].from, 480);
  assert.equal(result.segments.at(-1)!.to, 580);
  assert.deepEqual(
    result.segments.map((item) => item.kind),
    ["class", "gap", "class"],
  );
});
test("a 07:20 event extends exactly to 07:20, and removing it retracts the extension", () => {
  const withEarly = createTimeline(blocks, [{ from: 440, to: 470 }]);
  assert.equal(withEarly.segments[0].from, 440);
  assert.equal(withEarly.segments[0].to, 480);
  assert.equal(withEarly.segments[0].kind, "before");
  assert.equal(createTimeline(blocks, []).segments[0].from, 480);
});
test("events in breaks and after lessons remain visible with monotonic positioning", () => {
  const result = createTimeline(blocks, [
    { from: 525, to: 535 },
    { from: 600, to: 660 },
  ]);
  assert.equal(result.segments.at(-1)!.to, 660);
  assert.equal(result.segments.at(-1)!.kind, "after");
  assert.ok(result.position(535) > result.position(525));
  assert.ok(result.position(660) > result.position(600));
  assert.equal(result.position(660), result.total);
});
test("cross-period events map continuously while resting gaps stay compact", () => {
  const result = createTimeline(blocks, []);
  assert.equal(result.position(525), result.segments[1].top);
  assert.equal(result.position(535), result.segments[2].top);
  assert.ok(result.segments[1].size < result.segments[0].size);
  assert.equal(result.position(480), 0);
});
test("without configured periods, existing events remain visible and an empty day stays empty", () => {
  assert.equal(createTimeline([], []).segments.length, 0);
  const result = createTimeline(
    [],
    [{ from: toMinute("07:20"), to: toMinute("08:10") }],
  );
  assert.equal(result.segments[0].from, 440);
  assert.equal(result.segments.at(-1)!.to, 490);
});

test("longer pre-class time adds only the required chunks, without padding earlier", () => {
  const result = createTimeline(blocks, [{ from: 400, to: 420 }]);
  const before = result.segments.filter((segment) => segment.kind === "before");
  assert.deepEqual(
    before.map((segment) => [segment.from, segment.to]),
    [
      [400, 435],
      [435, 480],
    ],
  );
});

test("semester week 10 identifies the current week and arrows advance by whole weeks", async () => {
  const { semesterWeek } = await import("./calendar-layout.js");
  assert.deepEqual(semesterWeek("2026-08-31", "2026-11-06", "2026-11-06"), {
    number: 10,
    isCurrent: true,
    beforeTerm: false,
  });
  assert.deepEqual(semesterWeek("2026-08-31", "2026-11-13", "2026-11-06"), {
    number: 11,
    isCurrent: false,
    beforeTerm: false,
  });
  assert.equal(
    semesterWeek("2026-08-31", "2026-11-08", "2026-11-06").number,
    10,
  );
  assert.equal(
    semesterWeek("2026-08-31", "2026-11-09", "2026-11-06").number,
    11,
  );
});
test("semester week arithmetic handles year boundaries, unset terms, and pre-term dates", async () => {
  const { semesterWeek } = await import("./calendar-layout.js");
  assert.equal(
    semesterWeek("2026-12-28", "2027-01-04", "2027-01-04").number,
    2,
  );
  assert.equal(
    semesterWeek("2026-09-01", "2026-08-31", "2026-08-31").number,
    1,
  );
  assert.equal(
    semesterWeek("2026-09-01", "2026-08-24", "2026-08-31").beforeTerm,
    true,
  );
  assert.equal(semesterWeek(null, "2026-11-06", "2026-11-06").number, null);
});
