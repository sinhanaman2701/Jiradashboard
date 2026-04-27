import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentTokens, refreshCurrentTokens } from "@/lib/session";
import { fetchUserWorklogs } from "@/lib/jira/timelog";
import { currentIstTimestamp, endOfMonth, formatYmd, shiftDays, startOfMonth, todayIST } from "@/lib/date-utils";

interface PersonalMonthTaskSummary {
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  totalLoggedSeconds: number;
  lastWorkedAt: string;
}

function getTasksInRange(
  entries: Awaited<ReturnType<typeof fetchUserWorklogs>>,
  fromTimestamp: string,
  toTimestamp: string
): PersonalMonthTaskSummary[] {
  const fromMs = new Date(fromTimestamp).getTime();
  const toMs = new Date(toTimestamp).getTime();
  const taskMap = new Map<string, PersonalMonthTaskSummary>();

  for (const entry of entries) {
    const startedMs = new Date(entry.started).getTime();
    if (startedMs < fromMs || startedMs > toMs) continue;

    const existing = taskMap.get(entry.issueKey);
    if (existing) {
      existing.totalLoggedSeconds += entry.timeSpentSeconds;
      if (entry.started > existing.lastWorkedAt) existing.lastWorkedAt = entry.started;
      continue;
    }

    taskMap.set(entry.issueKey, {
      issueKey: entry.issueKey,
      issueSummary: entry.issueSummary,
      projectKey: entry.projectKey,
      totalLoggedSeconds: entry.timeSpentSeconds,
      lastWorkedAt: entry.started,
    });
  }

  return [...taskMap.values()].sort((a, b) => {
    if (b.totalLoggedSeconds !== a.totalLoggedSeconds) {
      return b.totalLoggedSeconds - a.totalLoggedSeconds;
    }
    return b.lastWorkedAt.localeCompare(a.lastWorkedAt);
  });
}

function sumWorklogsInRange(
  entries: Awaited<ReturnType<typeof fetchUserWorklogs>>,
  fromTimestamp: string,
  toTimestamp: string
): number {
  const fromMs = new Date(fromTimestamp).getTime();
  const toMs = new Date(toTimestamp).getTime();

  return entries.reduce((sum, entry) => {
    const startedMs = new Date(entry.started).getTime();
    return startedMs >= fromMs && startedMs <= toMs ? sum + entry.timeSpentSeconds : sum;
  }, 0);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  let tokens = await getCurrentTokens();
  if (!user || !tokens) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fromDate = formatYmd(ninetyDaysAgo);
  const today = todayIST();
  const nowTimestamp = currentIstTimestamp();
  const thisMonthFrom = startOfMonth(today);
  const previousMonthDate = shiftDays(thisMonthFrom, -1);
  const previousMonthFrom = startOfMonth(previousMonthDate);
  const previousMonthTo = endOfMonth(previousMonthDate);

  try {
    let entries;
    try {
      entries = await fetchUserWorklogs(tokens.accessToken, tokens.cloudId, user.accountId, fromDate);
    } catch (err) {
      const refreshed = await refreshCurrentTokens();
      if (!refreshed) throw err;
      tokens = refreshed;
      entries = await fetchUserWorklogs(tokens.accessToken, tokens.cloudId, user.accountId, fromDate);
    }
    const total = entries.length;
    const thisMonthFromTs = `${thisMonthFrom}T00:00:00.000+05:30`;
    const previousMonthFromTs = `${previousMonthFrom}T00:00:00.000+05:30`;
    const previousMonthToTs = `${previousMonthTo}T23:59:59.999+05:30`;
    const summaries = {
      thisMonth: {
        label: "This month",
        from: thisMonthFrom,
        to: today,
        totalLoggedSeconds: sumWorklogsInRange(
          entries,
          thisMonthFromTs,
          nowTimestamp
        ),
        tasks: getTasksInRange(entries, thisMonthFromTs, nowTimestamp),
      },
      previousMonth: {
        label: "Previous month",
        from: previousMonthFrom,
        to: previousMonthTo,
        totalLoggedSeconds: sumWorklogsInRange(
          entries,
          previousMonthFromTs,
          previousMonthToTs
        ),
        tasks: getTasksInRange(entries, previousMonthFromTs, previousMonthToTs),
      },
    };

    return NextResponse.json({
      total,
      summaries,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
