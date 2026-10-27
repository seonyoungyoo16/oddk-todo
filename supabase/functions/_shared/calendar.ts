// Calendar arithmetic shared by browser, Node and Edge. No host timezone or DST.
export function isClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function isPlanDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function clockMinute(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number); return hours * 60 + minutes;
}
export function dateOrdinal(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86400000;
}
export function addCalendarDays(date: string, days: number): string | null {
  if (!isPlanDate(date) || !Number.isInteger(days)) return null;
  const shifted = new Date((dateOrdinal(date) + days) * 86400000);
  const year = shifted.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}
