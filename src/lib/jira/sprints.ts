import { todayIST } from "@/lib/date-utils";
import type { Sprint, SprintBoard, SprintIssue, SprintProject } from "@/lib/jira/sprint-types";

const PAGE_SIZE = 50;

function getBaseUrl(): string {
  return (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
}

function getAuthHeader(): string {
  const email = process.env.JIRA_EMAIL ?? "";
  const token = process.env.JIRA_API_TOKEN ?? "";
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Jira sprint request failed: ${response.status} ${message}`);
  }
  return (await response.json()) as T;
}

async function runConcurrent<T>(fns: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(fns.length);
  let cursor = 0;
  async function worker() {
    while (cursor < fns.length) {
      const i = cursor++;
      results[i] = await fns[i]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker));
  return results;
}

function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export async function fetchAllProjects(): Promise<SprintProject[]> {
  const projects: SprintProject[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      values?: Array<{ id?: string; key?: string; name?: string }>;
      isLast?: boolean;
    }>(`/rest/api/3/project/search?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const p of page.values ?? []) {
      if (!p.id || !p.key || !p.name) continue;
      projects.push({ id: p.id, key: p.key, name: p.name });
    }

    if (page.isLast || (page.values ?? []).length < PAGE_SIZE) break;
    startAt += PAGE_SIZE;
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchBoardsForProject(projectKey: string): Promise<SprintBoard[]> {
  const boards: SprintBoard[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      values?: Array<{
        id?: number;
        name?: string;
        location?: { projectKey?: string; projectName?: string };
      }>;
      isLast?: boolean;
    }>(`/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const b of page.values ?? []) {
      if (!b.id || !b.name) continue;
      boards.push({
        id: b.id,
        name: b.name,
        projectKey: b.location?.projectKey ?? projectKey,
        projectName: b.location?.projectName ?? projectKey
      });
    }

    if (page.isLast || (page.values ?? []).length < PAGE_SIZE) break;
    startAt += PAGE_SIZE;
  }

  return boards;
}

export async function fetchSprintsForBoard(boardId: number): Promise<Sprint[]> {
  const sprints: Sprint[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      values?: Array<{
        id?: number;
        name?: string;
        state?: string;
        startDate?: string;
        endDate?: string;
      }>;
      isLast?: boolean;
    }>(`/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const s of page.values ?? []) {
      if (!s.id || !s.name) continue;
      const state = (s.state ?? "future") as Sprint["state"];
      sprints.push({
        id: s.id,
        name: s.name,
        state,
        startDate: s.startDate,
        endDate: s.endDate,
        boardId
      });
    }

    if (page.isLast || (page.values ?? []).length < PAGE_SIZE) break;
    startAt += PAGE_SIZE;
  }

  return sprints.sort((a, b) => {
    const order = { active: 0, future: 1, closed: 2 };
    return (order[a.state] ?? 3) - (order[b.state] ?? 3);
  });
}

interface RawWorklog {
  authorAccountId: string;
  authorDisplayName: string;
  started: string;
  timeSpentSeconds: number;
}

async function fetchRawWorklogs(issueKey: string): Promise<RawWorklog[]> {
  const result: RawWorklog[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      worklogs?: Array<{
        author?: { accountId?: string; displayName?: string };
        started?: string;
        timeSpentSeconds?: number;
      }>;
      total?: number;
      startAt?: number;
      maxResults?: number;
    }>(`/rest/api/3/issue/${issueKey}/worklog?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const w of page.worklogs ?? []) {
      if (!w.author?.accountId || !w.started) continue;
      result.push({
        authorAccountId: w.author.accountId,
        authorDisplayName: w.author.displayName ?? w.author.accountId,
        started: w.started,
        timeSpentSeconds: w.timeSpentSeconds ?? 0
      });
    }

    const next = (page.startAt ?? 0) + (page.maxResults ?? PAGE_SIZE);
    if (next >= (page.total ?? 0) || (page.worklogs ?? []).length === 0) break;
    startAt = next;
  }

  return result;
}

function isInWindow(started: string, startDate?: string, endDate?: string): boolean {
  const date = started.slice(0, 10);
  if (startDate && date < startDate) return false;
  const end = endDate ?? todayIST();
  if (date > end) return false;
  return true;
}

export async function fetchSprintIssues(
  sprintId: number,
  startDate?: string,
  endDate?: string
): Promise<SprintIssue[]> {
  const issues: Array<{
    id: string;
    key: string;
    summary: string;
    assigneeAccountId?: string;
    assigneeDisplayName?: string;
    statusName?: string;
  }> = [];

  let startAt = 0;
  while (true) {
    const page = await jiraFetch<{
      issues?: Array<{
        id: string;
        key: string;
        fields?: {
          summary?: string;
          assignee?: { accountId?: string; displayName?: string };
          status?: { name?: string };
        };
      }>;
      total?: number;
      startAt?: number;
      maxResults?: number;
    }>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,assignee,status&startAt=${startAt}&maxResults=${PAGE_SIZE}`
    );

    for (const issue of page.issues ?? []) {
      issues.push({
        id: issue.id,
        key: issue.key,
        summary: issue.fields?.summary ?? issue.key,
        assigneeAccountId: issue.fields?.assignee?.accountId,
        assigneeDisplayName: issue.fields?.assignee?.displayName,
        statusName: issue.fields?.status?.name
      });
    }

    const next = (page.startAt ?? 0) + (page.maxResults ?? PAGE_SIZE);
    if (next >= (page.total ?? 0) || (page.issues ?? []).length === 0) break;
    startAt = next;
  }

  const worklogs = await runConcurrent(
    issues.map((issue) => () => fetchRawWorklogs(issue.key)),
    10
  );

  return issues.map((issue, idx) => {
    const all = worklogs[idx] ?? [];
    const inSprint = all.filter((w) => isInWindow(w.started, startDate, endDate));

    const userMap = new Map<string, { displayName: string; seconds: number }>();
    for (const w of inSprint) {
      const entry = userMap.get(w.authorAccountId);
      if (entry) {
        entry.seconds += w.timeSpentSeconds;
      } else {
        userMap.set(w.authorAccountId, { displayName: w.authorDisplayName, seconds: w.timeSpentSeconds });
      }
    }

    const sprintLoggedSeconds = inSprint.reduce((s, w) => s + w.timeSpentSeconds, 0);
    const totalLoggedSeconds = all.reduce((s, w) => s + w.timeSpentSeconds, 0);

    return {
      id: issue.id,
      key: issue.key,
      summary: issue.summary,
      assigneeAccountId: issue.assigneeAccountId,
      assigneeDisplayName: issue.assigneeDisplayName,
      statusName: issue.statusName,
      sprintLoggedSeconds,
      sprintLoggedHours: toHours(sprintLoggedSeconds),
      totalLoggedSeconds,
      totalLoggedHours: toHours(totalLoggedSeconds),
      userBreakdown: Array.from(userMap.entries())
        .map(([accountId, { displayName, seconds }]) => ({
          accountId,
          displayName,
          loggedSeconds: seconds,
          loggedHours: toHours(seconds)
        }))
        .sort((a, b) => b.loggedSeconds - a.loggedSeconds)
    };
  });
}
