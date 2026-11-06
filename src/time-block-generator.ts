import type { TimeBlock } from "../shared/contracts.js";
import { toMinute, toClock } from "./calendar-layout.js";

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
export type GeneratedTimeBlock = Omit<TimeBlock, "id">;
export interface GenerationOptions {
  firstStart: string;
  lessonMinutes: number;
  breakMinutes: number;
  morningCount: number;
  afternoonCount: number;
  eveningCount: number;
  middayBreakMinutes: number;
  eveningBreakMinutes: number;
}
function duration(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 180)
    throw new Error("每节时长需要为 1—180 分钟的整数。");
}
export function automaticEnd(start: string, minutes = 45) {
  duration(minutes);
  if (!clock.test(start)) throw new Error("请填写有效的开始时间。");
  const end = toMinute(start) + minutes;
  if (end >= 1440) throw new Error("课程将跨到次日，请调整开始时间或时长。");
  return toClock(end);
}
export function nextTimeBlock(
  rows: TimeBlock[],
  options: Pick<
    GenerationOptions,
    "lessonMinutes" | "breakMinutes" | "firstStart"
  >,
): GeneratedTimeBlock {
  duration(options.lessonMinutes);
  if (
    !Number.isInteger(options.breakMinutes) ||
    options.breakMinutes < 0 ||
    options.breakMinutes > 120
  )
    throw new Error("课间需要为 0—120 分钟的整数。");
  if (rows.some((row) => !clock.test(row.endTime)))
    throw new Error("请先补全已有时段的结束时间。");
  const from = rows.length
    ? Math.max(...rows.map((row) => toMinute(row.endTime))) +
      options.breakMinutes
    : toMinute(options.firstStart);
  if (from >= 1440) throw new Error("当天已经没有足够时间添加下一节。");
  const startTime = rows.length ? toClock(from) : options.firstStart;
  return {
    label: `第${rows.length + 1}节`,
    startTime,
    endTime: automaticEnd(startTime, options.lessonMinutes),
  };
}
export function generateTimeBlocks(
  options: GenerationOptions,
): GeneratedTimeBlock[] {
  duration(options.lessonMinutes);
  const counts = [
    options.morningCount,
    options.afternoonCount,
    options.eveningCount,
  ];
  if (
    counts.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 24,
    ) ||
    counts.reduce((sum, value) => sum + value, 0) > 24
  )
    throw new Error("各段节数需要为非负整数，全天合计最多 24 节。");
  if (!counts.some(Boolean)) throw new Error("至少设置一节课。");
  if (
    !Number.isInteger(options.breakMinutes) ||
    options.breakMinutes < 0 ||
    options.breakMinutes > 120
  )
    throw new Error("课间需要为 0—120 分钟的整数。");
  const rests = [0, options.middayBreakMinutes, options.eveningBreakMinutes];
  const rows: GeneratedTimeBlock[] = [];
  for (const [index, count] of counts.entries()) {
    if (!count) continue;
    const previous = rows.at(-1);
    if (
      previous &&
      (!Number.isInteger(rests[index]) ||
        rests[index] < 0 ||
        rests[index] > 720)
    )
      throw new Error(
        `请填写${index === 1 ? "午休" : "晚休"}时长（0—720 分钟的整数）。`,
      );
    if (!previous && !clock.test(options.firstStart))
      throw new Error(`请填写有效的每日第一节开始时间。`);
    let minute = previous
      ? toMinute(previous.endTime) + rests[index]
      : toMinute(options.firstStart);
    for (let i = 0; i < count; i++) {
      const startTime = toClock(minute);
      if (minute >= 1440)
        throw new Error("节次超过当天，请减少数量或调整时间。");
      const endTime = automaticEnd(startTime, options.lessonMinutes);
      rows.push({ label: `第${rows.length + 1}节`, startTime, endTime });
      minute = toMinute(endTime) + options.breakMinutes;
    }
  }
  return rows;
}
