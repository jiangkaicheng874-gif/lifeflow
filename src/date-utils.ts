export function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00`);
}
export function shiftDate(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function shiftMonth(key: string, months: number) {
  const date = dateFromKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return dateKey(date);
}
export function monthDates(key: string) {
  const first = `${key.slice(0, 7)}-01`;
  const offset = (dateFromKey(first).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) =>
    shiftDate(first, index - offset),
  );
}
export function localParts(iso: string) {
  const date = new Date(iso);
  return {
    date: dateKey(date),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}
export function localDateTimeToISO(day: string, time: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("请选择完整的日期和时间。");
  const date = new Date(`${day}T${time}:00`);
  if (
    Number.isNaN(+date) ||
    dateKey(date) !== day ||
    localParts(date.toISOString()).time !== time
  )
    throw new Error("所选日期或时间无效，请重新选择。");
  return date.toISOString();
}
