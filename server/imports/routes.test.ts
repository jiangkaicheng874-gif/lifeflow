import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { syntheticTimetable } from "./fixtures.js";
import { generateTimeBlocks } from "../../src/time-block-generator.js";
async function setup(t: TestContext, token?: string) {
  const instance = createApp({ databasePath: ":memory:", token });
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    instance.close();
  });
  const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = (path: string, method = "GET", body?: unknown, auth = token) =>
    fetch(address + path, {
      method,
      headers: {
        "Content-Type": Buffer.isBuffer(body)
          ? "application/octet-stream"
          : "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      ...(body === undefined
        ? {}
        : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
    });
  const blocks = generateTimeBlocks({
    firstStart: "08:30",
    lessonMinutes: 45,
    breakMinutes: 10,
    morningCount: 4,
    afternoonCount: 4,
    eveningCount: 4,
    middayBreakMinutes: 120,
    eveningBreakMinutes: 60,
  }).map((row) => ({ ...row, id: randomUUID() }));
  const settings = {
    timeBlocks: blocks,
    semesterStart: "2026-08-31",
    version: 0,
  };
  await call("/calendar-preferences", "PUT", settings);
  const preview = await (
    await call("/imports/neu/preview", "POST", await syntheticTimetable())
  ).json();
  const input = (indices = [0]) => ({
    previewId: preview.previewId,
    preferencesVersion: 1,
    selections: indices.map((i) => ({
      candidateId: preview.courses[i].id,
      firstPeriod: 1,
      lastPeriod: 2,
      periodConfirmed: true,
    })),
  });
  const all = () =>
    call("/events?from=2026-08-30T00:00:00Z&to=2026-09-30T00:00:00Z").then(
      (r) => r.json(),
    );
  return { call, preview, input, all, settings };
}
test("file preview never writes; plan and atomic commit persist location and notes, repeated commit/file stays duplicate", async (t) => {
  const { call, preview, input, all } = await setup(t);
  assert.equal(preview.courses.length, 3);
  assert.equal((await all()).events.length, 0);
  const plan = await (await call("/imports/neu/plan", "POST", input())).json();
  assert.deepEqual(plan.counts, { added: 2, duplicates: 0, conflicts: 0 });
  assert.equal(plan.items[0].startsAt, "2026-08-31T00:30:00.000Z");
  assert.equal(plan.items[0].endsAt, "2026-08-31T02:10:00.000Z");
  assert.equal((await all()).events.length, 0);
  const payload = { ...input(), digest: plan.digest, skipConflicts: false };
  const saved = await call("/imports/neu/commit", "POST", payload);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).added, 2);
  assert.equal(
    (await call("/imports/neu/commit", "POST", payload)).status,
    200,
  );
  const events = (await all()).events;
  assert.equal(events.length, 2);
  assert.equal(events[0].location, "浑南校区 测试楼101");
  assert.match(events[0].notes, /教师甲/);
  const another = await (
    await call("/imports/neu/preview", "POST", await syntheticTimetable())
  ).json();
  const duplicate = await (
    await call("/imports/neu/plan", "POST", {
      previewId: another.previewId,
      preferencesVersion: 1,
      selections: [
        {
          candidateId: another.courses[0].id,
          firstPeriod: 1,
          lastPeriod: 2,
          periodConfirmed: true,
        },
      ],
    })
  ).json();
  assert.deepEqual(duplicate.counts, { added: 0, duplicates: 2, conflicts: 0 });
});
test("ambiguous lessons need confirmation; invalid ranges, stale settings and forged selection never write", async (t) => {
  const { call, input, all, settings } = await setup(t);
  const unchecked = input([1]);
  unchecked.selections[0].periodConfirmed = false;
  assert.equal(
    (await call("/imports/neu/plan", "POST", unchecked)).status,
    400,
  );
  const range = input();
  range.selections[0].lastPeriod = 13;
  assert.equal((await call("/imports/neu/plan", "POST", range)).status, 400);
  const forged = input();
  forged.selections[0].candidateId = randomUUID();
  assert.equal((await call("/imports/neu/plan", "POST", forged)).status, 400);
  assert.equal(
    (
      await call("/imports/neu/plan", "POST", {
        ...input(),
        previewId: randomUUID(),
      })
    ).status,
    410,
  );
  await call("/calendar-preferences", "PUT", { ...settings, version: 1 });
  assert.equal((await call("/imports/neu/plan", "POST", input())).status, 409);
  assert.equal((await all()).events.length, 0);
});
test("file-internal conflicts mark both courses and do not choose the first one", async (t) => {
  const { call, input, all } = await setup(t);
  const plan = await (
    await call("/imports/neu/plan", "POST", input([1, 2]))
  ).json();
  assert.deepEqual(plan.counts, { added: 2, duplicates: 0, conflicts: 4 });
  assert.equal((await all()).events.length, 0);
  const payload = {
    ...input([1, 2]),
    digest: plan.digest,
    skipConflicts: false,
  };
  assert.equal(
    (await call("/imports/neu/commit", "POST", payload)).status,
    409,
  );
  const result = await (
    await call("/imports/neu/commit", "POST", {
      ...payload,
      skipConflicts: true,
    })
  ).json();
  assert.deepEqual(result, { added: 2, duplicates: 0, conflicts: 4 });
  assert.equal((await all()).events.length, 2);
});
test("changes after checking reject the entire commit; explicit recheck can skip actual existing conflicts", async (t) => {
  const { call, input, all } = await setup(t);
  const plan = await (await call("/imports/neu/plan", "POST", input())).json();
  await call("/events", "POST", {
    title: "已有安排",
    startsAt: "2026-08-31T08:30:00+08:00",
    endsAt: "2026-08-31T09:15:00+08:00",
  });
  assert.equal(
    (
      await call("/imports/neu/commit", "POST", {
        ...input(),
        digest: plan.digest,
        skipConflicts: true,
      })
    ).status,
    409,
  );
  assert.equal((await all()).events.length, 1);
  const checked = await (
    await call("/imports/neu/plan", "POST", input())
  ).json();
  assert.deepEqual(checked.counts, { added: 1, duplicates: 0, conflicts: 1 });
  assert.equal(
    (
      await call("/imports/neu/commit", "POST", {
        ...input(),
        digest: checked.digest,
        skipConflicts: true,
      })
    ).status,
    200,
  );
  assert.equal((await all()).events.length, 2);
});
test("file upload is authenticated, size bounded and rejects invalid workbook without writing", async (t) => {
  const { call, all } = await setup(t, "a-valid-local-token-for-tests");
  assert.equal(
    (
      await call(
        "/imports/neu/preview",
        "POST",
        await syntheticTimetable(),
        "wrong",
      )
    ).status,
    401,
  );
  assert.equal(
    (await call("/imports/neu/preview", "POST", Buffer.alloc(512 * 1024 + 1)))
      .status,
    413,
  );
  assert.equal(
    (await call("/imports/neu/preview", "POST", Buffer.from("not xlsx")))
      .status,
    400,
  );
  assert.equal((await all()).events.length, 0);
});

test("internal duplicate copies also report conflict when the original cannot be imported", async (t) => {
  const { call, all } = await setup(t);
  const preview = await (
    await call(
      "/imports/neu/preview",
      "POST",
      await syntheticTimetable(false, true),
    )
  ).json();
  const input = {
    previewId: preview.previewId,
    preferencesVersion: 1,
    selections: preview.courses
      .slice(1)
      .map((course: { id: string }) => ({
        candidateId: course.id,
        firstPeriod: 1,
        lastPeriod: 2,
        periodConfirmed: true,
      })),
  };
  const plan = await (await call("/imports/neu/plan", "POST", input)).json();
  assert.deepEqual(plan.counts, { added: 2, duplicates: 0, conflicts: 6 });
  assert.equal((await all()).events.length, 0);
});
