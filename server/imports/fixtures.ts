// Synthetic workbook used only by tests and local UI verification. No real timetable data.
import ExcelJS from "exceljs";
export async function syntheticTimetable(formula = false, duplicate = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("测试课表");
  sheet.getCell("A1").value = "2026-2027学年秋季学期 测试课表";
  sheet.mergeCells("A1:X1");
  sheet.getCell("A2").value = "节次/星期";
  sheet.mergeCells("A2:C2");
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  for (let i = 0; i < 7; i++) {
    sheet.getCell(2, 4 + i * 3).value = `星期${names[i]}`;
    sheet.mergeCells(2, 4 + i * 3, 2, 6 + i * 3);
  }
  for (let i = 1; i <= 12; i++) {
    sheet.getCell(i + 2, 1).value = `第${i}节`;
    sheet.mergeCells(i + 2, 1, i + 2, 3);
  }
  sheet.getCell("D3").value =
    "测试班\n课程甲 A100001\n1-2周 教师甲 浑南校区 测试楼101\n考查 / 五级制";
  sheet.mergeCells("D3:F4");
  sheet.getCell("G3").value =
    "测试班\n课程乙 A100002\n1-4周(双) 教师乙 浑南校区 测试楼202\n考试 / 百分制\n[实]课程丙-实验\n1-4周 教师丙 浑南校区 测试机房";
  if (duplicate)
    sheet.getCell("G3").value =
      `测试班\n课程乙 A100002\n1-4周(双) 教师乙 浑南校区 测试楼202\n${sheet.getCell("G3").text}`;
  sheet.mergeCells("G3:I6");
  sheet.getCell("A18").value = "未排具体节次课程";
  sheet.getCell("A19").value = "教学班名称";
  sheet.getCell("A20").value = "测试实训[A000000]-A100004";
  if (formula) sheet.getCell("J3").value = { formula: "1+1", result: 2 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
