export const IST_TIME_ZONE = "Asia/Kolkata";

export function formatYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function shiftDays(date: string, days: number): string {
  const result = parseYmd(date);
  result.setDate(result.getDate() + days);
  return formatYmd(result);
}

export function startOfWeekMonday(date: string): string {
  const base = parseYmd(date);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return formatYmd(base);
}

export function startOfMonth(date: string): string {
  const base = parseYmd(date);
  base.setDate(1);
  return formatYmd(base);
}

export function endOfMonth(date: string): string {
  const base = parseYmd(date);
  base.setMonth(base.getMonth() + 1, 0);
  return formatYmd(base);
}

export function todayIST(): string {
  return formatYmd(new Date());
}

export function currentIstTimestamp(): string {
  const date = new Date();
  const day = formatYmd(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const second = parts.find((part) => part.type === "second")?.value ?? "00";

  return `${day}T${hour}:${minute}:${second}.000+0530`;
}
