import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";
import { createApp, type AppOptions } from "./app.js";

const first = {
  title: "验证日程",
  startsAt: "2026-11-10T14:00:00+08:00",
  endsAt: "2026-11-10T15:00:00+08:00",
};
async function fixture(t: TestContext, options: Partial<AppOptions> = {}) {
  const instance = createApp({ databasePath: ":memory:", ...options });
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    instance.close();
  };
  t.after(close);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return {
    close,
    call: (
      path: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(url + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
const day =
  "/events?from=2026-11-10T00:00:00%2B08:00&to=2026-11-11T00:00:00%2B08:00";

test("health describes actual storage and unintegrated AI; empty database has no seeded events", async (t) => {
  const { call } = await fixture(t);
  assert.deepEqual(await (await call("/health")).json(), {
    status: "ok",
    storage: "sqlite",
    assistant: "not-integrated",
  });
  assert.deepEqual(await (await call(day)).json(), { events: [] });
});
test("create, normalize timezone, read, edit and delete a real record", async (t) => {
  const { call } = await fixture(t);
  const created = await call("/events", "POST", first);
  assert.equal(created.status, 201);
  const { event } = await created.json();
  assert.equal(event.startsAt, "2026-11-10T06:00:00.000Z");
  assert.equal(event.version, 1);
  const changed = await call(`/events/${event.id}`, "PUT", {
    ...first,
    title: "已修改",
    version: 1,
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).event.version, 2);
  assert.equal((await (await call(day)).json()).events[0].title, "已修改");
  assert.equal(
    (await call(`/events/${event.id}`, "DELETE", { version: 2 })).status,
    204,
  );
  assert.deepEqual(await (await call(day)).json(), { events: [] });
});
test("reject overlapping intervals but permit adjacent intervals", async (t) => {
  const { call } = await fixture(t);
  await call("/events", "POST", first);
  assert.equal(
    (
      await call("/events", "POST", {
        ...first,
        startsAt: "2026-11-10T14:30:00+08:00",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/events", "POST", {
        ...first,
        startsAt: first.endsAt,
        endsAt: "2026-11-10T16:00:00+08:00",
      })
    ).status,
    201,
  );
});
test("competing inserts cannot both reserve the same interval", async (t) => {
  const { call } = await fixture(t);
  const responses = await Promise.all([
    call("/events", "POST", first),
    call("/events", "POST", first),
  ]);
  assert.deepEqual(responses.map((value) => value.status).sort(), [201, 409]);
});
test("cross-midnight events appear on each affected day and still conflict", async (t) => {
  const { call } = await fixture(t);
  const value = {
    title: "跨日",
    startsAt: "2026-11-09T23:30:00+08:00",
    endsAt: "2026-11-10T00:30:00+08:00",
  };
  assert.equal((await call("/events", "POST", value)).status, 201);
  assert.equal((await (await call(day)).json()).events.length, 1);
  const prior =
    "/events?from=2026-11-09T00:00:00%2B08:00&to=2026-11-10T00:00:00%2B08:00";
  assert.equal((await (await call(prior)).json()).events.length, 1);
  assert.equal(
    (
      await call("/events", "POST", {
        ...value,
        startsAt: "2026-11-10T00:00:00+08:00",
      })
    ).status,
    409,
  );
});
test("invalid input and client-supplied ownership cannot modify data", async (t) => {
  const { call } = await fixture(t);
  for (const body of [
    { ...first, title: "   " },
    { ...first, endsAt: first.startsAt },
    { ...first, startsAt: "tomorrow" },
    { ...first, ownerId: "other-user" },
  ]) {
    assert.equal((await call("/events", "POST", body)).status, 400);
  }
  assert.deepEqual(await (await call(day)).json(), { events: [] });
  assert.equal((await call("/events?from=bad&to=bad")).status, 400);
});
test("stale edits and deletions are rejected, with original data intact", async (t) => {
  const { call } = await fixture(t);
  const { event } = await (await call("/events", "POST", first)).json();
  assert.equal(
    (
      await call(`/events/${event.id}`, "PUT", {
        ...first,
        title: "current",
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/events/${event.id}`, "PUT", { ...first, version: 1 })).status,
    409,
  );
  assert.equal(
    (await call(`/events/${event.id}`, "DELETE", { version: 1 })).status,
    409,
  );
  assert.equal((await (await call(day)).json()).events[0].title, "current");
});
test("access token and explicit CORS origin are enforced independently", async (t) => {
  const token = "test-token-abcdefghijklmnopqrstuvwxyz";
  const { call } = await fixture(t, {
    token,
    allowedOrigins: ["capacitor://localhost"],
  });
  assert.equal((await call(day)).status, 401);
  assert.equal(
    (
      await call(day, "GET", undefined, {
        Authorization: `Bearer ${token}`,
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const allowed = await call(day, "GET", undefined, {
    Authorization: `Bearer ${token}`,
    Origin: "capacitor://localhost",
  });
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "capacitor://localhost",
  );
  assert.equal(allowed.headers.get("cache-control"), "no-store");
});
test("database records and local identity persist after closing and reopening", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lifeflow-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "test.sqlite");
  const initial = await fixture(t, { databasePath });
  const { event } = await (await initial.call("/events", "POST", first)).json();
  await initial.close();
  const reopened = await fixture(t, { databasePath });
  const saved = (await (await reopened.call(day)).json()).events[0];
  assert.deepEqual(saved, event);
  await reopened.close();
});

const periodOne = {
  id: "00000000-0000-4000-8000-000000000001",
  label: "第1节",
  startTime: "08:30",
  endTime: "09:15",
};
const periodTwo = {
  id: "00000000-0000-4000-8000-000000000002",
  label: "第2节",
  startTime: "09:25",
  endTime: "10:10",
};

test("period preferences are sorted, versioned and reject invalid replacements atomically", async (t) => {
  const { call } = await fixture(t);
  assert.deepEqual(await (await call("/calendar-preferences")).json(), {
    timeBlocks: [],
    version: 0,
    semesterStart: null,
  });
  const saved = await call("/calendar-preferences", "PUT", {
    timeBlocks: [periodTwo, periodOne],
    version: 0,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {
    timeBlocks: [periodOne, periodTwo],
    version: 1,
    semesterStart: null,
  });
  assert.equal(
    (await call("/calendar-preferences", "PUT", { timeBlocks: [], version: 0 }))
      .status,
    409,
  );
  for (const timeBlocks of [
    [{ ...periodOne, endTime: "08:00" }],
    [{ ...periodOne, startTime: "25:00" }],
    [periodOne, { ...periodTwo, startTime: "09:00" }],
    [periodOne, { ...periodTwo, id: periodOne.id }],
    [{ ...periodOne, ownerId: "someone-else" }],
  ]) {
    assert.equal(
      (await call("/calendar-preferences", "PUT", { timeBlocks, version: 1 }))
        .status,
      400,
    );
  }
  assert.deepEqual(await (await call("/calendar-preferences")).json(), {
    timeBlocks: [periodOne, periodTwo],
    version: 1,
    semesterStart: null,
  });
});

test("v1 database upgrade keeps events, and course periods persist across restart", async (t) => {
  const { default: Database } = await import("better-sqlite3");
  const directory = mkdtempSync(join(tmpdir(), "lifeflow-migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "test.sqlite");
  const original = await fixture(t, { databasePath });
  const { event } = await (
    await original.call("/events", "POST", first)
  ).json();
  await original.close();
  const old = new Database(databasePath);
  old.exec("DROP TABLE calendar_preferences; PRAGMA user_version = 1;");
  old.close();
  const upgraded = await fixture(t, { databasePath });
  assert.deepEqual((await (await upgraded.call(day)).json()).events[0], event);
  assert.equal(
    (
      await upgraded.call("/calendar-preferences", "PUT", {
        timeBlocks: [periodOne, periodTwo],
        version: 0,
      })
    ).status,
    200,
  );
  await upgraded.close();
  const reopened = await fixture(t, { databasePath });
  assert.deepEqual(
    await (await reopened.call("/calendar-preferences")).json(),
    { timeBlocks: [periodOne, periodTwo], version: 1, semesterStart: null },
  );
  assert.deepEqual((await (await reopened.call(day)).json()).events[0], event);
  await reopened.close();
});

test("semester date is validated and preserved when only periods are changed", async (t) => {
  const { call } = await fixture(t);
  const saved = await call("/calendar-preferences", "PUT", {
    timeBlocks: [],
    version: 0,
    semesterStart: "2026-08-31",
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).semesterStart, "2026-08-31");
  for (const semesterStart of [
    "2026-02-30",
    "2026-13-01",
    "tomorrow",
    "2026-11-06T00:00:00Z",
  ]) {
    assert.equal(
      (
        await call("/calendar-preferences", "PUT", {
          timeBlocks: [],
          version: 1,
          semesterStart,
        })
      ).status,
      400,
    );
  }
  const changed = await call("/calendar-preferences", "PUT", {
    timeBlocks: [periodOne],
    version: 1,
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).semesterStart, "2026-08-31");
  const clear = await call("/calendar-preferences", "PUT", {
    timeBlocks: [periodOne],
    version: 2,
    semesterStart: null,
  });
  assert.equal((await clear.json()).semesterStart, null);
});

test("v2 period settings upgrade preserves settings and defaults semester to unset", async (t) => {
  const { default: Database } = await import("better-sqlite3");
  const directory = mkdtempSync(join(tmpdir(), "lifeflow-v2-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "test.sqlite");
  const original = await fixture(t, { databasePath });
  assert.equal(
    (
      await original.call("/calendar-preferences", "PUT", {
        timeBlocks: [periodOne],
        version: 0,
      })
    ).status,
    200,
  );
  await original.close();
  const old = new Database(databasePath);
  old.exec(
    "ALTER TABLE calendar_preferences DROP COLUMN semester_start; PRAGMA user_version = 2;",
  );
  old.close();
  const upgraded = await fixture(t, { databasePath });
  assert.deepEqual(
    await (await upgraded.call("/calendar-preferences")).json(),
    { timeBlocks: [periodOne], version: 1, semesterStart: null },
  );
  await upgraded.close();
});
