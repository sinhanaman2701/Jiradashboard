import { SettingsShell } from "@/components/SettingsShell";
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

export default async function SettingsPage() {
  const today = formatYmd(new Date());
  const data = await getDashboardData({
    from: today,
    to: today,
    trackingView: "daily"
  });

  return <SettingsShell users={data.users} />;
}
