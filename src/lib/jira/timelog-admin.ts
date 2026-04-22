import { shiftDays, todayIST } from "@/lib/date-utils";
import { fetchAllIssueWorklogs, getCachedUsers, isJiraConfigured, searchIssuesWithWorklogs } from "@/lib/jira/client";
import type { JiraWorklog } from "@/lib/jira/types";

const DAY_COUNT = 7;

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
}

export interface AdminTimeLogEntry {
  id: string;
  date: string;
  started: string;
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  timeSpentSeconds: number;
  timeSpentHours: number;
}

export interface AdminTimeLogDailyLog {
  date: string;
  loggedSeconds: number;
  loggedHours: number;
  entries: AdminTimeLogEntry[];
}

export interface AdminTimeLogUser {
  accountId: string;
  displayName: string;
  active: boolean;
  todayLoggedSeconds: number;
  todayLoggedHours: number;
  days: AdminTimeLogDay[];
  dailyLogs: AdminTimeLogDailyLog[];
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

  const logsByUser = new Map<string, JiraWorklog[]>();
  for (const worklog of worklogs) {
    const date = worklogDate(worklog.started);
    if (date < from || date > to) continue;

    const existing = logsByUser.get(worklog.authorAccountId);
    if (existing) {
      existing.push(worklog);
    } else {
      logsByUser.set(worklog.authorAccountId, [worklog]);
    }
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

        const entries: AdminTimeLogEntry[] = userLogs
          .map((worklog) => ({
            id: worklog.id,
            date: worklogDate(worklog.started),
            started: worklog.started,
            issueKey: worklog.issueKey,
            issueSummary: worklog.issueSummary,
            projectKey: worklog.projectKey,
            timeSpentSeconds: worklog.timeSpentSeconds,
            timeSpentHours: toHours(worklog.timeSpentSeconds),
          }))
          .sort((a, b) => b.started.localeCompare(a.started));
        const entriesByDate = new Map<string, AdminTimeLogEntry[]>();
        for (const entry of entries) {
          const existing = entriesByDate.get(entry.date);
          if (existing) {
            existing.push(entry);
          } else {
            entriesByDate.set(entry.date, [entry]);
          }
        }
        const dailyLogs = dates
          .map((date) => {
            const dayEntries = entriesByDate.get(date) ?? [];
            const loggedSeconds = dayEntries.reduce((sum, entry) => sum + entry.timeSpentSeconds, 0);
            return {
              date,
              loggedSeconds,
              loggedHours: toHours(loggedSeconds),
              entries: dayEntries,
            };
          })
          .filter((day) => day.loggedSeconds > 0)
          .sort((a, b) => b.date.localeCompare(a.date));

        const todayLoggedSeconds = secondsByDate.get(to) ?? 0;

        return {
          accountId: user.accountId,
          displayName: user.displayName,
          active: user.active,
          todayLoggedSeconds,
          todayLoggedHours: toHours(todayLoggedSeconds),
          days: dates.map((date) => {
            const loggedSeconds = secondsByDate.get(date) ?? 0;
            return {
              date,
              loggedSeconds,
              loggedHours: toHours(loggedSeconds),
              hasLogged: loggedSeconds > 0,
            };
          }),
          dailyLogs,
        };
      })
      .sort((a, b) => {
        if (a.todayLoggedSeconds === 0 && b.todayLoggedSeconds > 0) return -1;
        if (a.todayLoggedSeconds > 0 && b.todayLoggedSeconds === 0) return 1;
        return a.displayName.localeCompare(b.displayName);
      }),
  };
}
