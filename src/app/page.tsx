import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DashboardShell } from "@/components/DashboardShell";
import { getCachedDashboardData, getDashboardData } from "@/lib/jira/dashboard";
import { getCachedUsers, isJiraConfigured } from "@/lib/jira/client";
import { mockUsers } from "@/lib/jira/mock-data";
import { formatYmd, parseYmd, shiftDays, startOfWeekMonday, todayIST } from "@/lib/date-utils";

function getPresetRange(
  preset: string | undefined,
  customFrom?: string,
  customTo?: string
): { from: string; to: string; label: string; preset: "today" | "yesterday" | "last-week" | "last-month" | "custom" } {
  const today = todayIST();

  if (preset === "yesterday") {
    const yesterday = shiftDays(today, -1);
    return { from: yesterday, to: yesterday, label: "Yesterday", preset };
  }

  if (preset === "last-week") {
    const lastWeekStart = shiftDays(startOfWeekMonday(today), -7);
    const lastWeekEnd = shiftDays(lastWeekStart, 6);
    return { from: lastWeekStart, to: lastWeekEnd, label: "Last Week", preset };
  }

  if (preset === "last-month") {
    const todayDate = parseYmd(today);
    const lastMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
    return { from: formatYmd(lastMonthStart), to: formatYmd(lastMonthEnd), label: "Last Month", preset };
  }

  if (preset === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo, label: `${customFrom} – ${customTo}`, preset };
  }

  return { from: today, to: today, label: "Today", preset: "today" };
}

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{ preset?: string; from?: string; to?: string; view?: string; refresh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/time-logging");

  const params = (await searchParams) ?? {};
  const view =
    params.view === "sprints" ? "sprints" :
    params.view === "manage-team" ? "manage-team" :
    "dashboard";
  const selectedRange = getPresetRange(params.preset, params.from, params.to);

  const bypassCache = Boolean(params.refresh);
  const data = view === "dashboard"
    ? bypassCache
      ? await getDashboardData({ from: selectedRange.from, to: selectedRange.to, trackingView: "daily" })
      : await getCachedDashboardData({ from: selectedRange.from, to: selectedRange.to, trackingView: "daily" })
    : null;
  const manageTeamUsers = view === "manage-team"
    ? (isJiraConfigured() ? await getCachedUsers() : mockUsers)
    : [];

  return (
    <DashboardShell
      data={data}
      manageTeamUsers={manageTeamUsers}
      view={view}
      preset={selectedRange.preset}
      rangeLabel={selectedRange.label}
      refreshKey={params.refresh ?? ""}
      syncedAt={data?.syncedAt ?? new Date().toISOString()}
      user={user}
    />
  );
}
