import { fetchAllUsers, fetchIssueWorklogs, getJiraBaseUrl, isJiraConfigured, searchIssuesWithWorklogs } from "@/lib/jira/client";
import { mockIssues, mockUsers, mockWorklogs } from "@/lib/jira/mock-data";
import type { JiraDashboardData, JiraIssue, JiraTrackingView, JiraUser, JiraUserPeriodSummary, JiraUserSummary, JiraWorklog } from "@/lib/jira/types";

const IST_TIME_ZONE = "Asia/Kolkata";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

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

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

function getDatePart(timestamp: string): string {
  return formatYmd(new Date(timestamp));
}

function getWorkingDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = parseYmd(from);
  const end = parseYmd(to);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatYmd(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: IST_TIME_ZONE
  }).format(date);
}

function shortDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: IST_TIME_ZONE
  }).format(new Date(value));
}

function rangeLabel(startDate: string, endDate: string): string {
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: IST_TIME_ZONE
  }).format(new Date(startDate))} - ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: IST_TIME_ZONE
  }).format(new Date(endDate))}`;
}

function getPeriodKey(date: string, trackingView: JiraTrackingView): string {
  if (trackingView === "daily") return date;
  const asDate = parseYmd(date);
  if (trackingView === "weekly") {
    return formatYmd(startOfWeekMonday(asDate));
  }
  return `${asDate.getFullYear()}-${pad(asDate.getMonth() + 1)}`;
}

function buildPeriodMetadata(workingDates: string[], trackingView: JiraTrackingView): Map<string, JiraUserPeriodSummary> {
  const map = new Map<string, JiraUserPeriodSummary>();

  for (const date of workingDates) {
    const key = getPeriodKey(date, trackingView);
    const existing = map.get(key);
    if (existing) {
      existing.workingDays += 1;
      existing.endDate = date;
      existing.expectedHours = existing.workingDays * 8;
      existing.varianceHours = toHours(existing.loggedSeconds - existing.expectedHours * 3600);
      continue;
    }

    let label = shortDateLabel(date);
    let startDate = date;
    let endDate = date;

    if (trackingView === "weekly") {
      const weekStart = parseYmd(key);
      startDate = date;
      endDate = date;
      label = rangeLabel(formatYmd(weekStart), formatYmd(addDays(weekStart, 4)));
    } else if (trackingView === "monthly") {
      const monthDate = parseYmd(`${key}-01`);
      label = monthLabel(monthDate);
    }

    map.set(key, {
      periodKey: key,
      label,
      startDate,
      endDate,
      workingDays: 1,
      loggedSeconds: 0,
      loggedHours: 0,
      expectedHours: 8,
      varianceHours: -8
    });
  }

  if (trackingView === "weekly") {
    for (const period of map.values()) {
      period.label = rangeLabel(period.startDate, period.endDate);
      period.expectedHours = period.workingDays * 8;
      period.varianceHours = toHours(period.loggedSeconds - period.expectedHours * 3600);
    }
  }

  if (trackingView === "monthly") {
    for (const period of map.values()) {
      period.expectedHours = period.workingDays * 8;
      period.varianceHours = toHours(period.loggedSeconds - period.expectedHours * 3600);
    }
  }

  return map;
}

function statusFor(loggedHours: number, expectedHours: number): JiraUserSummary["status"] {
  if (loggedHours === 0) return "missing";
  if (loggedHours < expectedHours) return "under";
  if (loggedHours > expectedHours) return "over";
  return "complete";
}

export function getDefaultFilters(): { from: string; to: string } {
  const now = new Date();
  return {
    from: formatYmd(monthStart(now)),
    to: formatYmd(monthEnd(now))
  };
}

function filterRange(worklogs: JiraWorklog[], from: string, to: string): JiraWorklog[] {
  return worklogs.filter((worklog) => {
    const date = getDatePart(worklog.started);
    return date >= from && date <= to;
  });
}

function buildData(args: {
  mode: "mock" | "live";
  trackingView: JiraTrackingView;
  baseUrl?: string;
  from: string;
  to: string;
  projectKeys: string[];
  users: JiraUser[];
  worklogs: JiraWorklog[];
  userQuery?: string;
}): JiraDashboardData {
  const workingDates = getWorkingDates(args.from, args.to);
  const expectedHoursPerUser = workingDates.length * 8;
  const userQuery = args.userQuery?.trim().toLowerCase();

  const users = args.users
    .filter((user) => user.active)
    .filter((user) => !userQuery || user.displayName.toLowerCase().includes(userQuery))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const summaries: JiraUserSummary[] = users.map((user) => {
    const dayMap = new Map<string, number>();
    const periodMap = buildPeriodMetadata(workingDates, args.trackingView);
    const ticketMap = new Map<
      string,
      { issueKey: string; issueSummary: string; projectKey: string; loggedSeconds: number; loggedHours: number }
    >();

    for (const date of workingDates) {
      dayMap.set(date, 0);
    }

    for (const worklog of args.worklogs) {
      if (worklog.authorAccountId !== user.accountId) continue;
      if (args.projectKeys.length && !args.projectKeys.includes(worklog.projectKey)) continue;

      const date = getDatePart(worklog.started);
      if (!dayMap.has(date)) continue;

      dayMap.set(date, (dayMap.get(date) ?? 0) + worklog.timeSpentSeconds);
      const periodKey = getPeriodKey(date, args.trackingView);
      const period = periodMap.get(periodKey);
      if (period) {
        period.loggedSeconds += worklog.timeSpentSeconds;
        period.loggedHours = toHours(period.loggedSeconds);
        period.varianceHours = toHours(period.loggedSeconds - period.expectedHours * 3600);
        if (date < period.startDate) {
          period.startDate = date;
        }
        if (date > period.endDate) {
          period.endDate = date;
        }
        if (args.trackingView === "weekly") {
          period.label = rangeLabel(period.startDate, period.endDate);
        }
      }

      const existing = ticketMap.get(worklog.issueKey);
      if (existing) {
        existing.loggedSeconds += worklog.timeSpentSeconds;
        existing.loggedHours = toHours(existing.loggedSeconds);
      } else {
        ticketMap.set(worklog.issueKey, {
          issueKey: worklog.issueKey,
          issueSummary: worklog.issueSummary,
          projectKey: worklog.projectKey,
          loggedSeconds: worklog.timeSpentSeconds,
          loggedHours: toHours(worklog.timeSpentSeconds)
        });
      }
    }

    const dailyBreakdown = Array.from(dayMap.entries()).map(([date, loggedSeconds]) => {
      const loggedHours = toHours(loggedSeconds);
      return {
        date,
        loggedSeconds,
        loggedHours,
        expectedHours: 8,
        varianceHours: toHours(loggedSeconds - 8 * 3600)
      };
    });

    const loggedSeconds = dailyBreakdown.reduce((sum, day) => sum + day.loggedSeconds, 0);
    const loggedHours = toHours(loggedSeconds);
    const periodBreakdown = Array.from(periodMap.values()).map((period) => ({
      ...period,
      loggedHours: toHours(period.loggedSeconds),
      expectedHours: period.workingDays * 8,
      varianceHours: toHours(period.loggedSeconds - period.workingDays * 8 * 3600)
    }));

    return {
      accountId: user.accountId,
      displayName: user.displayName,
      active: user.active,
      emailAddress: user.emailAddress,
      workingDaysInRange: workingDates.length,
      expectedHours: expectedHoursPerUser,
      loggedSeconds,
      loggedHours,
      varianceHours: toHours(loggedSeconds - expectedHoursPerUser * 3600),
      ticketCount: ticketMap.size,
      status: statusFor(loggedHours, expectedHoursPerUser),
      dailyBreakdown,
      periodBreakdown,
      ticketBreakdown: Array.from(ticketMap.values()).sort((a, b) => b.loggedSeconds - a.loggedSeconds)
    };
  });

  summaries.sort((a, b) => {
    if (a.varianceHours !== b.varianceHours) return a.varianceHours - b.varianceHours;
    return a.displayName.localeCompare(b.displayName);
  });

  const expectedHours = summaries.reduce((sum, user) => sum + user.expectedHours, 0);
  const loggedHours = Math.round(summaries.reduce((sum, user) => sum + user.loggedHours, 0) * 100) / 100;

  return {
    mode: args.mode,
    trackingView: args.trackingView,
    baseUrl: args.baseUrl,
    from: args.from,
    to: args.to,
    selectedProjects: args.projectKeys,
    summary: {
      usersCount: summaries.length,
      workingDaysInRange: workingDates.length,
      expectedHours,
      loggedHours,
      varianceHours: Math.round((loggedHours - expectedHours) * 100) / 100,
      underTargetUsers: summaries.filter((user) => user.status === "missing" || user.status === "under").length
    },
    users: summaries
  };
}

function mockProjectKeys(): string[] {
  return Array.from(new Set(mockIssues.map((issue) => issue.projectKey))).sort();
}

export async function getDashboardData(args: {
  from?: string;
  to?: string;
  projectKeys?: string[];
  userQuery?: string;
  trackingView?: JiraTrackingView;
}): Promise<JiraDashboardData> {
  const defaults = getDefaultFilters();
  const from = args.from?.trim() || defaults.from;
  const to = args.to?.trim() || defaults.to;
  const projectKeys = (args.projectKeys ?? []).filter(Boolean);
  const trackingView = args.trackingView ?? "daily";

  if (!isJiraConfigured()) {
    return buildData({
      mode: "mock",
      trackingView,
      from,
      to,
      projectKeys: projectKeys.length ? projectKeys : mockProjectKeys(),
      users: mockUsers,
      worklogs: filterRange(mockWorklogs, from, to),
      userQuery: args.userQuery
    });
  }

  try {
    const users = await fetchAllUsers();
    const issues: JiraIssue[] = await searchIssuesWithWorklogs({ from, to, projectKeys });
    const worklogLists = await Promise.all(issues.map((issue) => fetchIssueWorklogs(issue)));
    const worklogs = filterRange(worklogLists.flat(), from, to);

    return buildData({
      mode: "live",
      trackingView,
      baseUrl: getJiraBaseUrl(),
      from,
      to,
      projectKeys,
      users,
      worklogs,
      userQuery: args.userQuery
    });
  } catch (error) {
    console.error("Jira live fetch failed, using mock data instead:", error);
    return buildData({
      mode: "mock",
      trackingView,
      from,
      to,
      projectKeys: projectKeys.length ? projectKeys : mockProjectKeys(),
      users: mockUsers,
      worklogs: filterRange(mockWorklogs, from, to),
      userQuery: args.userQuery
    });
  }
}
