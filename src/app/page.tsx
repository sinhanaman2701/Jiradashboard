import { DashboardShell } from "@/components/DashboardShell";
import { getDashboardData } from "@/lib/jira/dashboard";

const IST_TIME_ZONE = "Asia/Kolkata";

function formatYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function shiftDays(date: string, days: number): string {
  const result = parseYmd(date);
  result.setDate(result.getDate() + days);
  return formatYmd(result);
}

function startOfWeekMonday(date: string): string {
  const base = parseYmd(date);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return formatYmd(base);
}

function getPresetRange(
  preset: string | undefined,
  customFrom?: string,
  customTo?: string
): { from: string; to: string; label: string; preset: "today" | "yesterday" | "last-week" | "last-month" | "custom" } {
  const today = formatYmd(new Date());

  if (preset === "yesterday") {
    const yesterday = shiftDays(today, -1);
    return { from: yesterday, to: yesterday, label: "Yesterday", preset };
  }

  if (preset === "last-week") {
    const currentWeekStart = startOfWeekMonday(today);
    const lastWeekStart = shiftDays(currentWeekStart, -7);
    const lastWeekEnd = shiftDays(lastWeekStart, 6);
    return {
      from: lastWeekStart,
      to: lastWeekEnd,
      label: "Last Week",
      preset
    };
  }

  if (preset === "last-month") {
    const todayDate = parseYmd(today);
    const lastMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
    return {
      from: formatYmd(lastMonthStart),
      to: formatYmd(lastMonthEnd),
      label: "Last Month",
      preset
    };
  }

  if (preset === "custom" && customFrom && customTo) {
    return {
      from: customFrom,
      to: customTo,
      label: `${customFrom} – ${customTo}`,
      preset
    };
  }

  return { from: today, to: today, label: "Today", preset: "today" };
}

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const selectedRange = getPresetRange(params.preset, params.from, params.to);

  const data = await getDashboardData({
    from: selectedRange.from,
    to: selectedRange.to,
    trackingView: "daily"
  });

  return (
    <DashboardShell
      data={data}
      preset={selectedRange.preset}
      rangeLabel={selectedRange.label}
    />
  );
}
