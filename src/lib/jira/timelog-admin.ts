import { parseYmd, shiftDays, todayIST } from "@/lib/date-utils";
import { fetchAllIssueWorklogs, getCachedUsers, isJiraConfigured, searchIssuesWithWorklogs } from "@/lib/jira/client";
import type { JiraWorklog } from "@/lib/jira/types";

const DAY_COUNT = 5;

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

export interface AdminTimeLogUser {
  accountId: string;
  displayName: string;
  active: boolean;
  todayLoggedSeconds: number;
  todayLoggedHours: number;
  weeklyLoggedSeconds: number;
  days: AdminTimeLogDay[];
  productClientGroups: ProductClientGroup[];
}

export interface AdminTimeLogOverview {
  from: string;
  to: string;
  users: AdminTimeLogUser[];
}

export async function getAdminTimeLogOverview(): Promise<AdminTimeLogOverview> {
  const to = todayIST();
  const from = shiftDays(to, -(DAY_COUNT - 1));
  const dates = Array.from({ length: DAY_COUNT }, (_, index) => shiftDays(from, index));

  if (!isJiraConfigured()) {
    return { from, to, users: [] };
  }

  const [users, issues] = await Promise.all([
    getCachedUsers(),
    searchIssuesWithWorklogs({ from, to }),
  ]);
  const worklogs = await fetchAllIssueWorklogs(issues);
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  const logsByUser = new Map<string, JiraWorklog[]>();
  for (const worklog of worklogs) {
    const date = worklogDate(worklog.started);
    if (date < from || date > to) continue;
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

        // Single pass: build taskMap for product/client grouping
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

        const productClientGroups: ProductClientGroup[] = [...groupMap.entries()]
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

        const todayLoggedSeconds = secondsByDate.get(to) ?? 0;
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
            };
          }),
          productClientGroups,
        };
      })
      .sort((a, b) => {
        if (a.todayLoggedSeconds === 0 && b.todayLoggedSeconds > 0) return -1;
        if (a.todayLoggedSeconds > 0 && b.todayLoggedSeconds === 0) return 1;
        return a.displayName.localeCompare(b.displayName);
      }),
  };
}
