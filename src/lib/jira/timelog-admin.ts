import { parseYmd, shiftDays, startOfWeekMonday, todayIST } from "@/lib/date-utils";
import { fetchAllIssueWorklogs, getCachedUsers, isJiraConfigured, searchIssuesWithWorklogs } from "@/lib/jira/client";
import type { JiraWorklog } from "@/lib/jira/types";

const WORK_WEEK_DAYS = 5;
const ADMIN_LOOKBACK_DAYS = 30;

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
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  productClientGroups: ProductClientGroup[];
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

export async function getAdminTimeLogOverview(): Promise<AdminTimeLogOverview> {
  const today = todayIST();
  const from = startOfWeekMonday(today);
  const to = shiftDays(from, WORK_WEEK_DAYS - 1);
  const dates = Array.from({ length: WORK_WEEK_DAYS }, (_, index) => shiftDays(from, index));
  const oldestWeekFrom = shiftDays(today, -(ADMIN_LOOKBACK_DAYS - 1));

  if (!isJiraConfigured()) {
    return { from, to, users: [] };
  }

  const [users, issues] = await Promise.all([
    getCachedUsers(),
    searchIssuesWithWorklogs({ from: oldestWeekFrom, to: today }),
  ]);
  const worklogs = await fetchAllIssueWorklogs(issues);
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  const logsByUser = new Map<string, JiraWorklog[]>();
  for (const worklog of worklogs) {
    const date = worklogDate(worklog.started);
    if (date < oldestWeekFrom || date > today) continue;
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
        const weeklyGroups: AdminTimeLogWeek[] = [
          { key: "this-week", label: "This week", from, to, totalLoggedSeconds: 0, totalLoggedHours: 0, productClientGroups: [] },
          {
            key: "previous-week",
            label: "Previous week",
            from: shiftDays(from, -7),
            to: shiftDays(to, -7),
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
          },
          {
            key: "two-weeks-ago",
            label: "2 weeks ago",
            from: shiftDays(from, -14),
            to: shiftDays(to, -14),
            totalLoggedSeconds: 0,
            totalLoggedHours: 0,
            productClientGroups: [],
          },
        ];

        for (const worklog of userLogs) {
          const date = worklogDate(worklog.started);
          if (date >= from && date <= today) {
            secondsByDate.set(date, (secondsByDate.get(date) ?? 0) + worklog.timeSpentSeconds);
          }
        }

        for (const week of weeklyGroups) {
          const weekLogs = userLogs.filter((worklog) => {
            const date = worklogDate(worklog.started);
            return date >= week.from && date <= week.to && date <= today;
          });
          week.totalLoggedSeconds = weekLogs.reduce((sum, worklog) => sum + worklog.timeSpentSeconds, 0);
          week.totalLoggedHours = toHours(week.totalLoggedSeconds);
          week.productClientGroups = buildProductClientGroups(weekLogs, issueMap);
        }

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
          productClientGroups: weeklyGroups[0]?.productClientGroups ?? [],
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
