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

export function todayIST(): string {
  return formatYmd(new Date());
}
