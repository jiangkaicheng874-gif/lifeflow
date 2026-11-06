import type { TimeBlock } from "../shared/contracts.js";

export interface MinuteRange {
  from: number;
  to: number;
}
export interface TimeSegment extends MinuteRange {
  label: string;
  kind: "class" | "gap" | "before" | "after" | "free";
  top: number;
  size: number;
}
export const toMinute = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export const toClock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

function weekMonday(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}

// The week containing the start date is week 1. UTC date arithmetic avoids DST drift.
export function semesterWeek(
  start: string | null,
  selected: string,
  today: string,
) {
  const monday = weekMonday(selected);
  const isCurrent = monday === weekMonday(today);
  const number = start
    ? Math.floor((monday - weekMonday(start)) / (7 * 86400000)) + 1
    : null;
  return { number, isCurrent, beforeTerm: number !== null && number < 1 };
}

export function weekNavigationLabel(
  start: string | null,
  selected: string,
  today: string,
) {
  const week = semesterWeek(start, selected, today);
  if (week.isCurrent) return "本周";
  if (week.number !== null)
    return week.beforeTerm ? "开学前" : `第${week.number}周`;
  const offset = Math.round(
    (weekMonday(selected) - weekMonday(today)) / (7 * 86400000),
  );
  if (offset === -1) return "上周";
  if (offset === 1) return "下周";
  return `${Math.abs(offset)}周${offset > 0 ? "后" : "前"}`;
}

// Course periods define the scale. Actual events extend it only as far as needed.
// Gaps are compressed but remain real time ranges; an event in a gap is visible.
export function createTimeline(blocks: TimeBlock[], ranges: MinuteRange[]) {
  const items = [...blocks].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const segments: TimeSegment[] = [];
  const earliest = ranges.length
    ? Math.min(...ranges.map((range) => range.from))
    : undefined;
  const latest = ranges.length
    ? Math.max(...ranges.map((range) => range.to))
    : undefined;
  const add = (
    from: number,
    to: number,
    label: string,
    kind: TimeSegment["kind"],
    size: number,
  ) => {
    if (to <= from) return;
    const previous = segments.at(-1);
    segments.push({
      from,
      to,
      label,
      kind,
      top: previous ? previous.top + previous.size : 0,
      size,
    });
  };
  const extra = (
    from: number,
    to: number,
    label: string,
    kind: "before" | "after" | "free",
    backwards = false,
  ) => {
    const length = items.length
      ? toMinute(items[0].endTime) - toMinute(items[0].startTime)
      : 45;
    const parts: MinuteRange[] = [];
    if (backwards) {
      for (let end = to; end > from; end -= length)
        parts.unshift({ from: Math.max(from, end - length), to: end });
    } else {
      for (let start = from; start < to; start += length)
        parts.push({ from: start, to: Math.min(to, start + length) });
    }
    for (const part of parts)
      add(
        part.from,
        part.to,
        label,
        kind,
        Math.max(0.45, (part.to - part.from) / length),
      );
  };
  if (!items.length) {
    if (earliest !== undefined && latest !== undefined)
      extra(earliest, latest, "自由安排", "free");
  } else {
    const first = toMinute(items[0].startTime);
    if (earliest !== undefined && earliest < first)
      extra(earliest, first, "课前", "before", true);
    for (const [index, block] of items.entries()) {
      const from = toMinute(block.startTime);
      const to = toMinute(block.endTime);
      if (index) {
        const previousEnd = toMinute(items[index - 1].endTime);
        const hasEvent = ranges.some(
          (range) => range.from < from && range.to > previousEnd,
        );
        add(
          previousEnd,
          from,
          from - previousEnd <= 40 ? "课间" : "间隔",
          "gap",
          hasEvent ? 0.7 : 0.16,
        );
      }
      add(from, to, block.label, "class", 1);
    }
    const last = toMinute(items.at(-1)!.endTime);
    if (latest !== undefined && latest > last)
      extra(last, latest, "课后", "after");
  }
  const total = segments.length
    ? segments.at(-1)!.top + segments.at(-1)!.size
    : 0;
  function position(minute: number) {
    const segment = segments.find(
      (value) => minute >= value.from && minute <= value.to,
    );
    if (!segment) return minute < (segments[0]?.from ?? 0) ? 0 : total;
    return (
      segment.top +
      ((minute - segment.from) / (segment.to - segment.from)) * segment.size
    );
  }
  return { segments, total, position };
}
