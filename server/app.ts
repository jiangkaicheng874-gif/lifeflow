import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { openDatabase } from "./database.js";
import type { CalendarEvent } from "../shared/contracts.js";

const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const draft = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: instant,
    endsAt: instant,
  })
  .strict();
const update = draft.extend({ version: z.number().int().positive() });
const dayRange = z.object({ from: instant, to: instant }).strict();
interface EventRow {
  id: string;
  owner_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}
function event(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
class BusinessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface AppOptions {
  databasePath: string;
  token?: string;
  allowedOrigins?: string[];
  staticDir?: string;
}

export function createApp(options: AppOptions) {
  const db = openDatabase(options.databasePath);
  // Local mode only. Replace this resolver with authenticated identity before cloud release.
  const ownerId = (
    db.prepare("SELECT id FROM profiles LIMIT 1").get() as { id: string }
  ).id;
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    const sameOrigin = `${req.protocol}://${req.get("host")}`;
    if (
      origin &&
      origin !== sameOrigin &&
      !options.allowedOrigins?.includes(origin)
    ) {
      res.status(403).json({ error: "此来源未被允许访问服务。" });
      return;
    }
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
    }
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (req.path === "/health" && req.method === "GET") {
      next();
      return;
    }
    if (options.token) {
      const expected = Buffer.from(`Bearer ${options.token}`);
      const actual = Buffer.from(req.get("authorization") ?? "");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res.status(401).json({ error: "请在设置中填写本地服务访问令牌。" });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", storage: "sqlite", assistant: "not-integrated" }),
  );

  function getEvent(id: string) {
    const row = db
      .prepare("SELECT * FROM events WHERE id = ? AND owner_id = ?")
      .get(id, ownerId) as EventRow | undefined;
    if (!row) throw new BusinessError(404, "日程不存在。");
    return row;
  }
  function checkWindow(
    input: { startsAt: string; endsAt: string },
    excludeId = "",
  ) {
    if (input.startsAt >= input.endsAt)
      throw new BusinessError(400, "结束时间必须晚于开始时间。");
    if (Date.parse(input.endsAt) - Date.parse(input.startsAt) > 31 * 86400000)
      throw new BusinessError(400, "单个日程不能超过 31 天。");
    const overlap = db
      .prepare(
        "SELECT title FROM events WHERE owner_id = ? AND id != ? AND starts_at < ? AND ends_at > ? LIMIT 1",
      )
      .get(ownerId, excludeId, input.endsAt, input.startsAt) as
      | { title: string }
      | undefined;
    if (overlap)
      throw new BusinessError(
        409,
        `与「${overlap.title}」时间重叠，请调整时间。`,
      );
  }
  app.get("/api/events", (req, res) => {
    const range = dayRange.parse(req.query);
    if (
      range.from >= range.to ||
      Date.parse(range.to) - Date.parse(range.from) > 62 * 86400000
    )
      throw new BusinessError(400, "查询时间范围须在 1 至 62 天内。");
    const rows = db
      .prepare(
        "SELECT * FROM events WHERE owner_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at, id",
      )
      .all(ownerId, range.to, range.from) as EventRow[];
    res.json({ events: rows.map(event) });
  });
  app.post("/api/events", (req, res) => {
    const input = draft.parse(req.body);
    const result = db
      .transaction(() => {
        checkWindow(input);
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO events (id, owner_id, title, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(id, ownerId, input.title, input.startsAt, input.endsAt, now, now);
        return event(getEvent(id));
      })
      .immediate();
    res.status(201).json({ event: result });
  });
  app.put("/api/events/:id", (req, res) => {
    const input = update.parse(req.body);
    const result = db
      .transaction(() => {
        const existing = getEvent(req.params.id);
        if (existing.version !== input.version)
          throw new BusinessError(409, "日程已被修改，请刷新后重试。");
        checkWindow(input, existing.id);
        db.prepare(
          "UPDATE events SET title = ?, starts_at = ?, ends_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ?",
        ).run(
          input.title,
          input.startsAt,
          input.endsAt,
          new Date().toISOString(),
          existing.id,
          ownerId,
        );
        return event(getEvent(existing.id));
      })
      .immediate();
    res.json({ event: result });
  });
  app.delete("/api/events/:id", (req, res) => {
    const input = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    db.transaction(() => {
      const existing = getEvent(req.params.id);
      if (existing.version !== input.version)
        throw new BusinessError(409, "日程已改变，请重新查看再删除。");
      db.prepare("DELETE FROM events WHERE id = ? AND owner_id = ?").run(
        existing.id,
        ownerId,
      );
    }).immediate();
    res.sendStatus(204);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "接口不存在。" }),
  );
  const staticDir = options.staticDir && resolve(options.staticDir);
  if (staticDir && existsSync(resolve(staticDir, "index.html"))) {
    app.use(express.static(staticDir));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "输入格式不正确，请检查标题和日期时间。" });
        return;
      }
      if (error instanceof BusinessError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "请求不是有效 JSON。" });
        return;
      }
      if (
        typeof error === "object" &&
        error &&
        "status" in error &&
        error.status === 413
      ) {
        res.status(413).json({ error: "请求内容过大。" });
        return;
      }
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      res.status(500).json({ error: "服务暂时无法完成请求，请稍后重试。" });
    },
  );
  return { app, close: () => db.close() };
}
