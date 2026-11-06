import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWeeks, parseNeuGrid, readNeuXlsx } from "./neu-xlsx.js";
import { syntheticTimetable } from "./fixtures.js";

test("week syntax preserves discontinuous ranges, single weeks, odd/even and rejects ambiguity", () => {
  assert.deepEqual(parseWeeks("1-3周,5周,7-8周"), [1, 2, 3, 5, 7, 8]);
  assert.deepEqual(parseWeeks("4-6周（双）,11周"), [4, 6, 11]);
  assert.deepEqual(parseWeeks("1-7周(单周)"), [1, 3, 5, 7]);
  for (const text of [
    "0周",
    "3-1周",
    "61周",
    "1-3周(未知)",
    "明天",
    "2周(单)",
    "1-3周,待定",
  ])
    assert.throws(() => parseWeeks(text));
});
test("synthetic XLSX preserves merge geometry, marks every course in a shared cell and separates unscheduled courses", async () => {
  const data = await readNeuXlsx(await syntheticTimetable());
  assert.equal(data.courses.length, 3);
  assert.equal(data.courseCellCount, 2);
  assert.equal(data.unscheduled.length, 1);
  assert.equal(data.termLabel, "2026-2027学年秋季学期");
  assert.deepEqual(data.warnings, []);
  const [a, b, c] = data.courses;
  assert.equal(a.title, "课程甲");
  assert.equal(a.weekday, 1);
  assert.equal(a.firstPeriod, 1);
  assert.equal(a.lastPeriod, 2);
  assert.equal(a.needsPeriodReview, false);
  assert.deepEqual(b.weeks, [2, 4]);
  assert.equal(b.lastPeriod, 4);
  assert.equal(b.needsPeriodReview, true);
  assert.equal(c.needsPeriodReview, true);
});
test("reject non-XLSX, excessive ZIP metadata, formulas and unknown layouts", async () => {
  await assert.rejects(readNeuXlsx(Buffer.from("not excel")));
  await assert.rejects(readNeuXlsx(Buffer.alloc(512 * 1024 + 1)));
  const huge = await syntheticTimetable();
  const entry = huge.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  huge.writeUInt32LE(9 * 1024 * 1024, entry + 24);
  await assert.rejects(readNeuXlsx(huge));
  await assert.rejects(readNeuXlsx(await syntheticTimetable(true)));
  assert.throws(() => parseNeuGrid({ cells: [] }));
});
