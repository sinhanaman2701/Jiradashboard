import { currentIstTimestamp, endOfMonth, parseYmd, shiftDays, startOfMonth, startOfWeekMonday, todayIST } from "@/lib/date-utils";
import { fetchAllIssueWorklogs, fetchWorklogsForDateRange, getCachedUsers, isJiraConfigured, searchIssuesWithWorklogs } from "@/lib/jira/client";
import type { JiraWorklog } from "@/lib/jira/types";

const WORK_WEEK_DAYS = 5;

function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

function worklogDate(started: string): string {
  return started.slice(0, 10);
}

export interface AdminTimeLogDay {
  date: string;
  loggedSeconds: number;
  loggedHours: number;
  hasLogged: boolean;
  isWeekend: boolean;
  isUpcoming: boolean;
}

export interface ProductClientTask {
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  loggedSeconds: number;
  eta?: string;
  lastLoggedAt: string;
  productClient?: string;
}

export interface ProductClientGroup {
  label: string;
  taskCount: number;
  totalLoggedSeconds: number;
  tasks: ProductClientTask[];
}

export interface AdminTimeLogWeek {
  key: string;
  label: string;
  from: string;
  to: string;
  toTimestamp?: string;
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  productClientGroups: ProductClientGroup[];
  hoursLabelMode: "weekly-target" | "total";
  loaded: boolean;
}

export interface AdminTimeLogUser {
  accountId: string;
  displayName: string;
  active: boolean;
  todayLoggedSeconds: number;
  todayLoggedHours: number;
  weeklyLoggedSeconds: number;
  days: AdminTimeLogDay[];
  productClientGroups: ProductClientGroup[];
  weeklyGroups: AdminTimeLogWeek[];
}

export interface AdminTimeLogOverview {
  from: string;
  to: string;
  users: AdminTimeLogUser[];
}

export interface AdminTeamTimeLogSummary {
  from: string;
  to: string;
  totalUsers: number;
  totalLoggedSeconds: number;
  totalExpectedSeconds: number;
  totalLoggedHours: number;
  totalExpectedHours: number;
  generatedAt: string;
}

export interface AdminTimeLogReportTask {
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  loggedSeconds: number;
  loggedHours: number;
  eta?: string;
  lastLoggedAt: string;
  productClient?: string;
}

export interface AdminTimeLogReportUser {
  accountId: string;
  displayName: string;
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  taskCount: number;
  tasks: AdminTimeLogReportTask[];
}

export interface AdminTimeLogReportPeriod {
  key: "this-month" | "previous-month";
  label: string;
  from: string;
  to: string;
  generatedAt: string;
  users: AdminTimeLogReportUser[];
}

function buildProductClientGroups(userLogs: JiraWorklog[], issueMap: Map<string, ReturnType<typeof searchIssuesWithWorklogs> extends Promise<(infer T)[]> ? T : never>): ProductClientGroup[] {
  const taskMap = new Map<string, ProductClientTask>();
  for (const worklog of userLogs) {
    const issue = issueMap.get(worklog.issueKey);
    const existing = taskMap.get(worklog.issueKey);
    if (existing) {
      existing.loggedSeconds += worklog.timeSpentSeconds;
      if (worklog.started > existing.lastLoggedAt) existing.lastLoggedAt = worklog.started;
    } else {
      taskMap.set(worklog.issueKey, {
        issueKey: worklog.issueKey,
        issueSummary: worklog.issueSummary,
        projectKey: worklog.projectKey,
        loggedSeconds: worklog.timeSpentSeconds,
        eta: issue?.eta,
        lastLoggedAt: worklog.started,
        productClient: issue?.productClient,
      });
    }
  }

  const groupMap = new Map<string, ProductClientTask[]>();
  for (const task of taskMap.values()) {
    const label = task.productClient ?? "Other";
    const g = groupMap.get(label);
    if (g) g.push(task);
    else groupMap.set(label, [task]);
  }

  return [...groupMap.entries()]
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
    .map(([label, tasks]) => ({
      label,
      taskCount: tasks.length,
      totalLoggedSeconds: tasks.reduce((sum, t) => sum + t.loggedSeconds, 0),
      tasks: [...tasks].sort((a, b) => b.loggedSeconds - a.loggedSeconds),
    }));
}

function buildReportTasks(
  userLogs: JiraWorklog[],
  issueMap: Map<string, ReturnType<typeof searchIssuesWithWorklogs> extends Promise<(infer T)[]> ? T : never>
): AdminTimeLogReportTask[] {
  const taskMap = new Map<string, AdminTimeLogReportTask>();

  for (const worklog of userLogs) {
    const issue = issueMap.get(worklog.issueKey);
    const existing = taskMap.get(worklog.issueKey);
    if (existing) {
      existing.loggedSeconds += worklog.timeSpentSeconds;
      existing.loggedHours = toHours(existing.loggedSeconds);
      if (worklog.started > existing.lastLoggedAt) existing.lastLoggedAt = worklog.started;
      continue;
    }

    taskMap.set(worklog.issueKey, {
      issueKey: worklog.issueKey,
      issueSummary: worklog.issueSummary,
      projectKey: worklog.projectKey,
      loggedSeconds: worklog.timeSpentSeconds,
      loggedHours: toHours(worklog.timeSpentSeconds),
      eta: issue?.eta,
      lastLoggedAt: worklog.started,
      productClient: issue?.productClient,
    });
  }

  return [...taskMap.values()].sort((a, b) => {
    if (b.loggedSeconds !== a.loggedSeconds) return b.loggedSeconds - a.loggedSeconds;
    return b.lastLoggedAt.localeCompare(a.lastLoggedAt);
  });
}

function workingWeekdaysInRange(from: string, to: string): number {
  let count = 0;
  const current = parseYmd(from);
  const end = parseYmd(to);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count += 1;
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// Initial load — current week only (fast)
export async function getAdminTimeLogOverview(): Promise<AdminTimeLogOverview> {
  const today = todayIST();
  const nowTimestamp = currentIstTimestamp();
  const from = startOfWeekMonday(today);
  const to = shiftDays(from, WORK_WEEK_DAYS - 1);
  const thisMonthFrom = startOfMonth(today);
  const previousMonthDate = shiftDays(thisMonthFrom, -1);
  const previousMonthFrom = startOfMonth(previousMonthDate);
  const previousMonthTo = endOfMonth(previousMonthDate);
  const dates = Array.from({ length: WORK_WEEK_DAYS }, (_, index) => shiftDays(from, index));

  if (!isJiraConfigured()) {
    return { from, to, users: [] };
  }

  const [users, issues] = await Promise.all([
    getCachedUsers(),
    searchIssuesWithWorklogs({ from, to: today }),
  ]);
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const worklogs = await fetchAllIssueWorklogs(issues);

  const logsByUser = new Map<string, JiraWorklog[]>();
  for (const worklog of worklogs) {
    const date = worklogDate(worklog.started);
    if (date < from || date > today) continue;
    const existing = logsByUser.get(worklog.authorAccountId);
    if (existing) existing.push(worklog);
    else logsByUser.set(worklog.authorAccountId, [worklog]);
  }

  return {
    from,
    to,
    users: users
      .filter((user) => user.active)
      .map((user) => {
        const userLogs = logsByUser.get(user.accountId) ?? [];
        const secondsByDate = new Map<string, number>(dates.map((date) => [date, 0]));

        for (const worklog of userLogs) {
          const date = worklogDate(worklog.started);
          secondsByDate.set(date, (secondsByDate.get(date) ?? 0) + worklog.timeSpentSeconds);
        }

        const thisWeekSeconds = userLogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
        const thisWeekGroups = buildProductClientGroups(userLogs, issueMap);

        const weeklyGroups: AdminTimeLogWeek[] = [
          {
            key: "this-week",
            label: "This week",
            from,
            to,
            totalLoggedSeconds: thisWeekSeconds,
            totalLoggedHours: toHours(thisWeekSeconds),
            productClientGroups: thisWeekGroups,
            hoursLabelMode: "weekly-target",
            loaded: true,
          },
          {
            key: "previous-week",
            label: "Previous week",
            from: shiftDays(from, -7),
            to: shiftDays(to, -7),
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
            hoursLabelMode: "weekly-target",
            loaded: false,
          },
          {
            key: "two-weeks-ago",
            label: "2 weeks ago",
            from: shiftDays(from, -14),
            to: shiftDays(to, -14),
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
            hoursLabelMode: "weekly-target",
            loaded: false,
          },
          {
            key: "this-month",
            label: "This month",
            from: thisMonthFrom,
            to: today,
            toTimestamp: nowTimestamp,
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
            hoursLabelMode: "total",
            loaded: false,
          },
          {
            key: "previous-month",
            label: "Previous month",
            from: previousMonthFrom,
            to: previousMonthTo,
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
            hoursLabelMode: "total",
            loaded: false,
          },
        ];

        const todayLoggedSeconds = secondsByDate.get(today) ?? 0;
        const weeklyLoggedSeconds = [...secondsByDate.entries()]
          .filter(([date]) => { const d = parseYmd(date).getDay(); return d !== 0 && d !== 6; })
          .reduce((sum, [, s]) => sum + s, 0);

        return {
          accountId: user.accountId,
          displayName: user.displayName,
          active: user.active,
          todayLoggedSeconds,
          todayLoggedHours: toHours(todayLoggedSeconds),
          weeklyLoggedSeconds,
          days: dates.map((date) => {
            const loggedSeconds = secondsByDate.get(date) ?? 0;
            const dow = parseYmd(date).getDay();
            return {
              date,
              loggedSeconds,
              loggedHours: toHours(loggedSeconds),
              hasLogged: loggedSeconds > 0,
              isWeekend: dow === 0 || dow === 6,
              isUpcoming: date > today,
            };
          }),
          productClientGroups: thisWeekGroups,
          weeklyGroups,
        };
      })
      .sort((a, b) => {
        if (a.todayLoggedSeconds === 0 && b.todayLoggedSeconds > 0) return -1;
        if (a.todayLoggedSeconds > 0 && b.todayLoggedSeconds === 0) return 1;
        return a.displayName.localeCompare(b.displayName);
      }),
  };
}

// Lazy load — called when a user opens a previous week's "View logs"
export async function getAdminUserWeekData(
  accountId: string,
  from: string,
  to: string,
  endTimestamp?: string
): Promise<{ totalLoggedSeconds: number; productClientGroups: ProductClientGroup[] }> {
  if (!isJiraConfigured()) return { totalLoggedSeconds: 0, productClientGroups: [] };

  // Run issue search and bulk worklog ID collection in parallel
  const issues = await searchIssuesWithWorklogs({ from, to });
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const issueById = new Map(issues.map((i) => [i.id, i]));

  // Bulk fetch: 2-3 API calls instead of one per issue
  const worklogs = await fetchWorklogsForDateRange(from, to, issueById, endTimestamp);

  const userLogs = worklogs.filter((w) => w.authorAccountId === accountId);

  const totalLoggedSeconds = userLogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
  const productClientGroups = buildProductClientGroups(userLogs, issueMap);

  return { totalLoggedSeconds, productClientGroups };
}

export async function getAdminTeamSummary(args: {
  from: string;
  to: string;
  endTimestamp?: string;
}): Promise<AdminTeamTimeLogSummary> {
  if (!isJiraConfigured()) {
    return {
      from: args.from,
      to: args.to,
      totalUsers: 0,
      totalLoggedSeconds: 0,
      totalExpectedSeconds: 0,
      totalLoggedHours: 0,
      totalExpectedHours: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  const [users, issues] = await Promise.all([
    getCachedUsers(),
    searchIssuesWithWorklogs({ from: args.from, to: args.to }),
  ]);
  const activeUsers = users.filter((user) => user.active);
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const worklogs = await fetchWorklogsForDateRange(args.from, args.to, issueById, args.endTimestamp);

  const totalLoggedSeconds = worklogs.reduce((sum, worklog) => sum + worklog.timeSpentSeconds, 0);
  const workingDays = workingWeekdaysInRange(args.from, args.to);
  const totalExpectedSeconds = activeUsers.length * workingDays * 8 * 3600;

  return {
    from: args.from,
    to: args.to,
    totalUsers: activeUsers.length,
    totalLoggedSeconds,
    totalExpectedSeconds,
    totalLoggedHours: toHours(totalLoggedSeconds),
    totalExpectedHours: toHours(totalExpectedSeconds),
    generatedAt: new Date().toISOString(),
  };
}

export async function getAdminTeamPeriodReport(args: {
  key: "this-month" | "previous-month";
  label: string;
  from: string;
  to: string;
  endTimestamp?: string;
}): Promise<AdminTimeLogReportPeriod> {
  if (!isJiraConfigured()) {
    return {
      key: args.key,
      label: args.label,
      from: args.from,
      to: args.to,
      generatedAt: new Date().toISOString(),
      users: [],
    };
  }

  const [users, issues] = await Promise.all([
    getCachedUsers(),
    searchIssuesWithWorklogs({ from: args.from, to: args.to }),
  ]);
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const worklogs = await fetchWorklogsForDateRange(args.from, args.to, issueById, args.endTimestamp);

  const logsByUser = new Map<string, JiraWorklog[]>();
  for (const worklog of worklogs) {
    const existing = logsByUser.get(worklog.authorAccountId);
    if (existing) existing.push(worklog);
    else logsByUser.set(worklog.authorAccountId, [worklog]);
  }

  const reportUsers = users
    .filter((user) => user.active)
    .map((user) => {
      const userLogs = logsByUser.get(user.accountId) ?? [];
      const tasks = buildReportTasks(userLogs, issueMap);
      const totalLoggedSeconds = userLogs.reduce((sum, worklog) => sum + worklog.timeSpentSeconds, 0);
      return {
        accountId: user.accountId,
        displayName: user.displayName,
        totalLoggedSeconds,
        totalLoggedHours: toHours(totalLoggedSeconds),
        taskCount: tasks.length,
        tasks,
      };
    })
    .sort((a, b) => {
      if (b.totalLoggedSeconds !== a.totalLoggedSeconds) return b.totalLoggedSeconds - a.totalLoggedSeconds;
      return a.displayName.localeCompare(b.displayName);
    });

  return {
    key: args.key,
    label: args.label,
    from: args.from,
    to: args.to,
    generatedAt: new Date().toISOString(),
    users: reportUsers,
  };
}
