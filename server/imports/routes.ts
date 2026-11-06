import express from "express";
import { randomUUID, createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { BusinessError } from "../errors.js";
import { readNeuXlsx } from "./neu-xlsx.js";
import type {
  CalendarPreferences,
  CoursePreview,
  CoursePlanInput,
  CoursePlanItem,
  CourseImportResult,
} from "../../shared/contracts.js";

const selection = z
  .object({
    candidateId: z.string().uuid(),
    firstPeriod: z.number().int().min(1).max(24),
    lastPeriod: z.number().int().min(1).max(24),
    periodConfirmed: z.boolean(),
  })
  .strict();
const planInput = z
  .object({
    previewId: z.string().uuid(),
    preferencesVersion: z.number().int().nonnegative(),
    selections: z.array(selection).min(1).max(200),
  })
  .strict();
const commitInput = planInput.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  skipConflicts: z.boolean(),
});
const lifetime = 15 * 60 * 1000;
interface Existing {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  notes: string;
  source_key: string | null;
  version: number;
}
interface Planned extends CoursePlanItem {
  sourceKey: string;
  notes: string;
  existingVersion?: number;
  existingId?: string;
}

export function courseImportRouter(
  db: Database.Database,
  ownerId: string,
  readPreferences: () => CalendarPreferences,
) {
  const router = express.Router();
  const previews = new Map<string, { value: CoursePreview; expires: number }>();
  const receipts = new Map<
    string,
    { value: CourseImportResult; expires: number }
  >();
  let reading = false;
  function cleanup() {
    const now = Date.now();
    for (const [key, item] of previews)
      if (item.expires < now) previews.delete(key);
    for (const [key, item] of receipts)
      if (item.expires < now) receipts.delete(key);
  }
  router.post(
    "/neu/preview",
    express.raw({ type: "application/octet-stream", limit: "512kb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new BusinessError(400, "请选择 XLSX 文件。");
      if (reading)
        throw new BusinessError(429, "正在读取上一份课表，请稍后再试。");
      reading = true;
      try {
        const sheet = await readNeuXlsx(req.body);
        cleanup();
        const value: CoursePreview = {
          ...sheet,
          previewId: randomUUID(),
          preferencesVersion: readPreferences().version,
        };
        previews.set(value.previewId, {
          value,
          expires: Date.now() + lifetime,
        });
        while (previews.size > 5)
          previews.delete(previews.keys().next().value!);
        res.json(value);
      } finally {
        reading = false;
      }
    },
  );
  function build(input: CoursePlanInput) {
    const preview = previews.get(input.previewId);
    if (!preview || preview.expires < Date.now())
      throw new BusinessError(410, "课表预览已过期，请重新选择文件。");
    const settings = readPreferences();
    if (
      settings.version !== input.preferencesVersion ||
      settings.version !== preview.value.preferencesVersion
    )
      throw new BusinessError(409, "学期或时段已修改，请重新读取课表。");
    if (!settings.semesterStart || !settings.timeBlocks.length)
      throw new BusinessError(
        400,
        "请先设置学期开始日期和课程时段，再读取课表。",
      );
    if (
      new Set(input.selections.map((s) => s.candidateId)).size !==
      input.selections.length
    )
      throw new BusinessError(400, "课程选择不能重复。");
    const monday = new Date(`${settings.semesterStart}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const planned: Planned[] = [];
    for (const selected of input.selections) {
      const course = preview.value.courses.find(
        (c) => c.id === selected.candidateId,
      );
      if (!course)
        throw new BusinessError(400, "选择包含不属于当前文件的课程。");
      if (course.needsPeriodReview && !selected.periodConfirmed)
        throw new BusinessError(400, "合并单元格中的课程需要先核对起止节次。");
      const first = settings.timeBlocks[selected.firstPeriod - 1],
        last = settings.timeBlocks[selected.lastPeriod - 1];
      if (!first || !last || selected.firstPeriod > selected.lastPeriod)
        throw new BusinessError(400, "课程节次超出已设置范围，请调整节次。");
      for (const week of course.weeks) {
        if (planned.length >= 3000)
          throw new BusinessError(
            400,
            "本次安排超过 3000 次，请分批选择课程。",
          );
        const date = new Date(
          +monday + ((week - 1) * 7 + course.weekday - 1) * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const startsAt = new Date(
            `${date}T${first.startTime}:00+08:00`,
          ).toISOString(),
          endsAt = new Date(`${date}T${last.endTime}:00+08:00`).toISOString();
        const notes = [
          course.teacher && `教师：${course.teacher}`,
          course.courseCode && `课程代码：${course.courseCode}`,
          `东北大学 · ${preview.value.termLabel}`,
        ]
          .filter(Boolean)
          .join("\n");
        if (notes.length > 1000)
          throw new BusinessError(400, "课程备注过长，请核对课表内容。");
        const sourceKey = createHash("sha256")
          .update(
            JSON.stringify([
              "neu",
              preview.value.termLabel,
              course.courseCode,
              course.title,
              date,
              selected.firstPeriod,
              selected.lastPeriod,
            ]),
          )
          .digest("hex");
        const item: Planned = {
          candidateId: course.id,
          title: course.title,
          location: course.location,
          startsAt,
          endsAt,
          status: "new",
          reason: "",
          sourceKey,
          notes,
        };
        const existing = db
          .prepare("SELECT * FROM events WHERE owner_id = ? AND source_key = ?")
          .get(ownerId, sourceKey) as Existing | undefined;
        const overlap = db
          .prepare(
            "SELECT * FROM events WHERE owner_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at,id",
          )
          .all(ownerId, endsAt, startsAt) as Existing[];
        const exact =
          existing ||
          overlap.find(
            (e) =>
              e.title === item.title &&
              e.starts_at === startsAt &&
              e.ends_at === endsAt &&
              e.location === item.location,
          );
        if (exact) {
          item.existingVersion = exact.version;
          item.existingId = exact.id;
          if (
            exact.title === item.title &&
            exact.starts_at === startsAt &&
            exact.ends_at === endsAt &&
            exact.location === item.location &&
            (!existing || exact.notes === notes)
          ) {
            item.status = "duplicate";
            item.reason = "已有相同安排";
          } else {
            item.status = "conflict";
            item.reason = "已导入课程发生变化，请人工核对";
          }
        } else if (overlap.length) {
          item.status = "conflict";
          item.reason = `与已有「${overlap[0].title}」重叠`;
          item.existingVersion = overlap[0].version;
          item.existingId = overlap[0].id;
        }
        planned.push(item);
      }
    }
    // Mark both sides of file-internal overlaps. Do not silently choose whichever course appeared first.
    for (let i = 0; i < planned.length; i++)
      for (let j = 0; j < i; j++) {
        const a = planned[i],
          b = planned[j];
        if (a.startsAt >= b.endsAt || a.endsAt <= b.startsAt) continue;
        if (
          a.sourceKey === b.sourceKey &&
          a.location === b.location &&
          a.notes === b.notes
        ) {
          if (a.status === "new") {
            a.status = "duplicate";
            a.reason = "文件内重复安排";
          }
        } else {
          if (a.status === "new" || a.reason === "文件内重复安排") {
            a.status = "conflict";
            a.reason = `与课表内「${b.title}」重叠`;
          }
          if (b.status === "new" || b.reason === "文件内重复安排") {
            b.status = "conflict";
            b.reason = `与课表内「${a.title}」重叠`;
          }
        }
      }
    const digest = createHash("sha256")
      .update(JSON.stringify([input, planned]))
      .digest("hex");
    const counts = {
      added: planned.filter((i) => i.status === "new").length,
      duplicates: planned.filter((i) => i.status === "duplicate").length,
      conflicts: planned.filter((i) => i.status === "conflict").length,
    };
    return {
      digest,
      counts,
      planned,
      items: planned.map(
        ({ sourceKey, notes, existingVersion, existingId, ...item }) => item,
      ),
    };
  }
  router.post("/neu/plan", (req, res) => {
    const result = build(planInput.parse(req.body));
    res.json({
      digest: result.digest,
      counts: result.counts,
      items: result.items,
    });
  });
  router.post("/neu/commit", (req, res) => {
    const { digest, skipConflicts, ...input } = commitInput.parse(req.body);
    const key = createHash("sha256")
      .update(JSON.stringify([input, digest, skipConflicts]))
      .digest("hex");
    const receipt = receipts.get(key);
    if (receipt && receipt.expires > Date.now()) {
      res.json(receipt.value);
      return;
    }
    const result = db
      .transaction(() => {
        const current = build(input);
        if (current.digest !== digest)
          throw new BusinessError(409, "日程或课表已变化，请重新检查后确认。");
        if (current.counts.conflicts && !skipConflicts)
          throw new BusinessError(
            409,
            "存在时间冲突，请核对或明确选择跳过冲突。",
          );
        const now = new Date().toISOString();
        const insert = db.prepare(
          "INSERT INTO events (id, owner_id, title, starts_at, ends_at, created_at, updated_at, location, notes, source_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        for (const item of current.planned.filter((i) => i.status === "new"))
          insert.run(
            randomUUID(),
            ownerId,
            item.title,
            item.startsAt,
            item.endsAt,
            now,
            now,
            item.location,
            item.notes,
            item.sourceKey,
          );
        return current.counts;
      })
      .immediate();
    cleanup();
    receipts.set(key, { value: result, expires: Date.now() + lifetime });
    while (receipts.size > 20) receipts.delete(receipts.keys().next().value!);
    res.json(result);
  });
  return router;
}
