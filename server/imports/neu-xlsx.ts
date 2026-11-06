import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { BusinessError } from "../errors.js";
import type { CourseCandidate, CourseSheet } from "../../shared/contracts.js";

export interface GridCell {
  row: number;
  column: number;
  text: string;
  lastRow: number;
}
export interface CourseGrid {
  cells: GridCell[];
}
const fail = (message: string): never => {
  throw new BusinessError(400, message);
};
const numerals: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
  十五: 15,
  十六: 16,
  十七: 17,
  十八: 18,
  十九: 19,
  二十: 20,
  二十一: 21,
  二十二: 22,
  二十三: 23,
  二十四: 24,
};
export function parseWeeks(text: string) {
  const weeks = new Set<number>();
  for (const part of text
    .normalize("NFKC")
    .replace(/[～~—–]/g, "-")
    .split(/[,、]/)) {
    const match = /^(\d+)(?:-(\d+))?周(?:\((单|双)(?:周)?\))?$/.exec(
      part.trim(),
    );
    if (!match) fail("无法识别周次，请核对原课表。");
    const from = Number(match![1]),
      to = Number(match![2] || match![1]);
    if (from < 1 || to > 60 || from > to) fail("课表周次须在 1—60 周内。");
    for (let week = from; week <= to; week++)
      if (!match![3] || week % 2 === (match![3] === "单" ? 1 : 0))
        weeks.add(week);
  }
  if (!weeks.size) fail("该周次范围没有符合单双周条件的日期。");
  return [...weeks].sort((a, b) => a - b);
}
export function parseNeuGrid(grid: CourseGrid): CourseSheet {
  const cells = grid.cells;
  const header = cells.find(
    (cell) => cell.text.replace(/\s/g, "") === "节次/星期",
  );
  if (!header) fail("不是已支持的东北大学打印课表：未找到节次／星期表头。");
  const days = cells.filter(
    (cell) =>
      cell.row === header!.row &&
      /^星期[一二三四五六日天]$/.test(cell.text.trim()),
  );
  const dayNames: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7,
  };
  if (
    days.length !== 7 ||
    new Set(days.map((cell) => dayNames[cell.text.trim().slice(-1)])).size !== 7
  )
    fail("课表星期列不完整，暂不能导入。");
  const periods = new Map<number, number>();
  for (const cell of cells.filter(
    (cell) => cell.column === header!.column && cell.row > header!.row,
  )) {
    const match = /^第([一二三四五六七八九十\d]+)节$/.exec(cell.text.trim());
    if (match) {
      const number = numerals[match[1]] || Number(match[1]);
      if (number >= 1 && number <= 24) periods.set(cell.row, number);
    }
  }
  if (!periods.size) fail("课表没有可识别的课程节次。");
  const courses: CourseCandidate[] = [],
    warnings: string[] = [];
  let courseCellCount = 0;
  for (const cell of cells) {
    const day = days.find((day) => day.column === cell.column);
    if (!day || !periods.has(cell.row) || !cell.text.trim()) continue;
    courseCellCount++;
    const firstPeriod = periods.get(cell.row)!,
      lastPeriod = periods.get(cell.lastRow);
    const sourceCell = `${String.fromCharCode(64 + cell.column)}${cell.row}`;
    if (!lastPeriod || lastPeriod < firstPeriod) {
      warnings.push(`${sourceCell} 的合并范围无法对应节次，未生成日程。`);
      continue;
    }
    const groups: {
      title: string;
      code: string;
      lines: {
        weeks: number[];
        weekText: string;
        teacher: string;
        location: string;
      }[];
    }[] = [];
    let current: (typeof groups)[number] | undefined;
    for (const raw of cell.text.replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const course = /^(.*?)\s+([A-Z]\d{5,})$/.exec(line);
      if (course || /^\[实\]/.test(line)) {
        current = {
          title: course ? course[1] : line,
          code: course?.[2] || "",
          lines: [],
        };
        groups.push(current);
        continue;
      }
      if (/^\d/.test(line) && line.includes("周")) {
        if (!current) {
          warnings.push(`${sourceCell} 有未关联到课程名的周次，未导入。`);
          continue;
        }
        const split = /^(\S+)\s+(.+)$/.exec(line);
        try {
          if (!split) fail("缺少周次或教师地点信息。");
          const weeks = parseWeeks(split![1]);
          const metadata = /^(.*?)\s+(\S*校区)(?:\s+(.*))?$/.exec(split![2]);
          current.lines.push({
            weeks,
            weekText: split![1],
            teacher: metadata?.[1] || "",
            location: metadata
              ? `${metadata[2]}${metadata[3] ? ` ${metadata[3]}` : ""}`
              : split![2],
          });
        } catch {
          warnings.push(
            `${sourceCell}「${current.title}」的周次无法解析，已跳过该条。`,
          );
        }
      }
    }
    for (const group of groups) {
      if (!group.lines.length)
        warnings.push(
          `${sourceCell}「${group.title}」没有可用的周次，未生成日程。`,
        );
      for (const line of group.lines)
        if (
          !group.title.trim() ||
          group.title.trim().length > 120 ||
          line.location.length > 200 ||
          line.teacher.length > 300
        ) {
          warnings.push(`${sourceCell} 的课程名称或地点信息过长，已跳过该条。`);
        } else
          courses.push({
            id: randomUUID(),
            title: group.title.trim(),
            courseCode: group.code,
            weekday: dayNames[day.text.trim().slice(-1)],
            firstPeriod,
            lastPeriod,
            ...line,
            sourceCell,
            needsPeriodReview: groups.length > 1,
          });
    }
    if (!groups.length)
      warnings.push(`${sourceCell} 的课程文字不在已支持格式内，未生成日程。`);
  }
  if (!courses.length)
    fail("没有解析到可导入课程，请检查是否导出了整学期打印课表。");
  if (courses.length > 200) fail("课程条目超过 200 条，请按学期分别导入。");
  const pending = cells.find((cell) => cell.text.trim() === "未排具体节次课程");
  const unscheduled = pending
    ? cells
        .filter(
          (cell) =>
            cell.column === 1 &&
            cell.row > pending.row + 1 &&
            cell.text.trim() &&
            !/^(打印人|教学班名称)/.test(cell.text),
        )
        .map((cell) => cell.text.trim())
    : [];
  const title = cells.find((cell) => cell.row < header!.row)?.text || "";
  const termLabel =
    /\d{4}-\d{4}学年[^\s]*学期/.exec(title)?.[0] || "学期未注明";
  return {
    school: "东北大学",
    termLabel,
    courses,
    warnings,
    unscheduled,
    courseCellCount,
  };
}
// Bound ZIP metadata before ExcelJS allocates worksheet structures. ZIP64/encryption are unnecessary for a small printed timetable.
function checkArchive(data: Buffer) {
  if (data.length > 512 * 1024 || data.length < 22)
    fail("请选择不超过 512KB 的 XLSX 打印课表。");
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) fail("文件不是受支持的 XLSX，请从教务系统重新导出 Excel。");
  const count = data.readUInt16LE(end + 10);
  let cursor = data.readUInt32LE(end + 16),
    total = 0;
  if (count > 200 || !count) fail("文件结构超出课表限制。");
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50)
      fail("XLSX 压缩结构损坏。");
    const size = data.readUInt32LE(cursor + 24),
      nameLength = data.readUInt16LE(cursor + 28),
      extra = data.readUInt16LE(cursor + 30),
      comment = data.readUInt16LE(cursor + 32);
    const name = data
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    total += size;
    if (
      data.readUInt16LE(cursor + 8) & 1 ||
      size === 0xffffffff ||
      total > 8 * 1024 * 1024 ||
      /vbaProject|\.bin$/i.test(name)
    )
      fail("文件包含不支持的内容或解压后过大。");
    cursor += 46 + nameLength + extra + comment;
  }
}
export async function readNeuXlsx(data: Buffer): Promise<CourseSheet> {
  checkArchive(data);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    fail("Excel 文件无法读取，请使用教务系统导出的原始 .xlsx 文件。");
  }
  if (workbook.worksheets.length !== 1)
    fail("当前仅支持单工作表的东北大学打印课表。");
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > 300 || sheet.columnCount > 64)
    fail("工作表超出课表行列限制。");
  const mergeEnds = new Map<string, number>();
  for (const range of sheet.model.merges) {
    const [from, to] = range.split(":");
    mergeEnds.set(from, Number(/\d+$/.exec(to || from)?.[0]));
  }
  const cells: GridCell[] = [];
  sheet.eachRow((row, rowIndex) =>
    row.eachCell((cell, column) => {
      if (
        cell.type === ExcelJS.ValueType.Formula ||
        cell.type === ExcelJS.ValueType.Hyperlink
      )
        fail("不支持含公式或超链接的课表，请使用原始打印导出文件。");
      if (cell.isMerged && cell.master.address !== cell.address) return;
      if (cell.text)
        cells.push({
          row: rowIndex,
          column,
          text: cell.text,
          lastRow: mergeEnds.get(cell.address) || rowIndex,
        });
    }),
  );
  return parseNeuGrid({ cells });
}
