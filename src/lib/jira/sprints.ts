import { todayIST } from "@/lib/date-utils";
import type { Sprint, SprintBoard, SprintIssue, SprintProject } from "@/lib/jira/sprint-types";

const PAGE_SIZE = 50;

const STATUS_PROGRESSION = [
  "not started", "development", "product review", "product review changes",
  "code review", "code review fixes", "qa level i", "qa fixes",
  "qa level ii", "ready for release", "done",
];

function isGoalAchieved(statusName: string | undefined, sprintGoal: string): boolean {
  if (!statusName || !sprintGoal) return false;
  const statusIdx = STATUS_PROGRESSION.indexOf(statusName.toLowerCase());
  const goalIdx = STATUS_PROGRESSION.indexOf(sprintGoal.toLowerCase());
  if (statusIdx === -1 || goalIdx === -1) return false;
  return statusIdx >= goalIdx;
}

export interface SprintGoalProjectSummary {
  projectKey: string;
  projectName: string;
  achieved: number;
  total: number;
}

export interface SprintGoalsSummary {
  achieved: number;
  total: number;
  byProject: SprintGoalProjectSummary[];
}

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

function matchesEtaChange(
  item: { field?: string; fieldId?: string },
  etaFieldId: string
): boolean {
  if (item.fieldId === etaFieldId) return true;
  const field = (item.field ?? "").trim().toLowerCase();
  return field === "eta" || field === "original estimate";
}

async function fetchEtaLastChangedAt(issueKey: string, etaFieldId: string): Promise<string | undefined> {
  let startAt = 0;
  let latest: string | undefined;

  while (true) {
    const page = await jiraFetch<{
      values?: Array<{
        created?: string;
        items?: Array<{ field?: string; fieldId?: string }>;
      }>;
      maxResults?: number;
      startAt?: number;
      total?: number;
    }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const history of page.values ?? []) {
      const changedEta = (history.items ?? []).some((item) => matchesEtaChange(item, etaFieldId));
      if (!changedEta || !history.created) continue;
      if (!latest || Date.parse(history.created) > Date.parse(latest)) {
        latest = history.created;
      }
    }

    const next = (page.startAt ?? 0) + (page.maxResults ?? PAGE_SIZE);
    if (next >= (page.total ?? 0) || (page.values ?? []).length === 0) break;
    startAt = next;
  }

  return latest;
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

async function fetchAllBoards(): Promise<SprintBoard[]> {
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
    }>(`/rest/agile/1.0/board?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const b of page.values ?? []) {
      if (!b.id || !b.name) continue;
      boards.push({
        id: b.id,
        name: b.name,
        projectKey: b.location?.projectKey ?? "UNKNOWN",
        projectName: b.location?.projectName ?? b.location?.projectKey ?? "Unknown"
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

export async function fetchActiveSprintCount(): Promise<number> {
  const boards = await fetchAllBoards();
  const sprintGroups = await runConcurrent(
    boards.map((board) => async () => {
      try {
        return await fetchActiveSprintsForBoard(board.id);
      } catch (error) {
        console.warn(`[sprints/active-count] skipping board ${board.id}:`, error);
        return [];
      }
    }),
    4
  );
  const activeSprintIds = new Set<number>();

  for (const sprints of sprintGroups) {
    for (const sprint of sprints) {
      if (sprint.state === "active") {
        activeSprintIds.add(sprint.id);
      }
    }
  }

  return activeSprintIds.size;
}

async function fetchActiveSprintsForBoard(boardId: number): Promise<Sprint[]> {
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
    }>(`/rest/agile/1.0/board/${boardId}/sprint?state=active&startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const s of page.values ?? []) {
      if (!s.id || !s.name) continue;
      sprints.push({
        id: s.id,
        name: s.name,
        state: "active",
        startDate: s.startDate,
        endDate: s.endDate,
        boardId
      });
    }

    if (page.isLast || (page.values ?? []).length < PAGE_SIZE) break;
    startAt += PAGE_SIZE;
  }

  return sprints;
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
  const etaFieldId = process.env.JIRA_ETA_FIELD_ID ?? "customfield_10071";
  const sprintGoalFieldId = process.env.JIRA_SPRINT_GOAL_FIELD_ID ?? "customfield_10104";

  const issues: Array<{
    id: string;
    key: string;
    summary: string;
    issueTypeName?: string;
    parentKey?: string;
    parentSummary?: string;
    assigneeAccountId?: string;
    assigneeDisplayName?: string;
    statusName?: string;
    eta: string;
    sprintGoal: string;
  }> = [];

  let startAt = 0;
  while (true) {
    const page = await jiraFetch<{
      issues?: Array<{
        id: string;
        key: string;
        fields?: {
          summary?: string;
          issuetype?: { name?: string };
          parent?: { key?: string; fields?: { summary?: string } };
          assignee?: { accountId?: string; displayName?: string };
          status?: { name?: string };
          [key: string]: unknown;
        };
      }>;
      total?: number;
      startAt?: number;
      maxResults?: number;
    }>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,issuetype,parent,assignee,status,${etaFieldId},${sprintGoalFieldId}&startAt=${startAt}&maxResults=${PAGE_SIZE}`
    );

    for (const issue of page.issues ?? []) {
      issues.push({
        id: issue.id,
        key: issue.key,
        summary: issue.fields?.summary ?? issue.key,
        issueTypeName: issue.fields?.issuetype?.name,
        parentKey: issue.fields?.parent?.key,
        parentSummary: issue.fields?.parent?.fields?.summary,
        assigneeAccountId: issue.fields?.assignee?.accountId,
        assigneeDisplayName: issue.fields?.assignee?.displayName,
        statusName: issue.fields?.status?.name,
        eta: (issue.fields?.[etaFieldId] as string | null) ?? "",
        sprintGoal: ((issue.fields?.[sprintGoalFieldId] as { value?: string } | null)?.value) ?? "",
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
  const etaLastChangedDates = await runConcurrent(
    issues.map((issue) => () => fetchEtaLastChangedAt(issue.key, etaFieldId)),
    8
  );

  return issues.map((issue, idx) => {
    const all = worklogs[idx] ?? [];
    const inSprint = all.filter((w) => isInWindow(w.started, startDate, endDate));
    const beforeSprint = startDate
      ? all.filter((w) => w.started.slice(0, 10) < startDate)
      : [];

    const userMap = new Map<string, { displayName: string; seconds: number }>();
    for (const w of inSprint) {
      const entry = userMap.get(w.authorAccountId);
      if (entry) {
        entry.seconds += w.timeSpentSeconds;
      } else {
        userMap.set(w.authorAccountId, { displayName: w.authorDisplayName, seconds: w.timeSpentSeconds });
      }
    }

    const previousUserMap = new Map<string, { displayName: string; seconds: number }>();
    for (const w of beforeSprint) {
      const entry = previousUserMap.get(w.authorAccountId);
      if (entry) {
        entry.seconds += w.timeSpentSeconds;
      } else {
        previousUserMap.set(w.authorAccountId, { displayName: w.authorDisplayName, seconds: w.timeSpentSeconds });
      }
    }

    const sprintLoggedSeconds = inSprint.reduce((s, w) => s + w.timeSpentSeconds, 0);
    const previousLoggedSeconds = beforeSprint.reduce((s, w) => s + w.timeSpentSeconds, 0);
    const totalLoggedSeconds = all.reduce((s, w) => s + w.timeSpentSeconds, 0);

    return {
      id: issue.id,
      key: issue.key,
      summary: issue.summary,
      issueTypeName: issue.issueTypeName,
      parentKey: issue.parentKey,
      parentSummary: issue.parentSummary,
      assigneeAccountId: issue.assigneeAccountId,
      assigneeDisplayName: issue.assigneeDisplayName,
      statusName: issue.statusName,
      eta: issue.eta,
      etaLastChangedAt: etaLastChangedDates[idx],
      sprintGoal: issue.sprintGoal,
      previousLoggedSeconds,
      previousLoggedHours: toHours(previousLoggedSeconds),
      sprintLoggedSeconds,
      sprintLoggedHours: toHours(sprintLoggedSeconds),
      totalLoggedSeconds,
      totalLoggedHours: toHours(totalLoggedSeconds),
      previousUserBreakdown: Array.from(previousUserMap.entries())
        .map(([accountId, { displayName, seconds }]) => ({
          accountId,
          displayName,
          loggedSeconds: seconds,
          loggedHours: toHours(seconds)
        }))
        .sort((a, b) => b.loggedSeconds - a.loggedSeconds),
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

async function fetchSprintIssuesMeta(
  sprintId: number
): Promise<Array<{ statusName?: string; sprintGoal: string }>> {
  const sprintGoalFieldId = process.env.JIRA_SPRINT_GOAL_FIELD_ID ?? "customfield_10104";
  const issues: Array<{ statusName?: string; sprintGoal: string }> = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      issues?: Array<{ fields?: { status?: { name?: string }; [key: string]: unknown } }>;
      total?: number;
      startAt?: number;
      maxResults?: number;
    }>(`/rest/agile/1.0/sprint/${sprintId}/issue?fields=status,${sprintGoalFieldId}&startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const issue of page.issues ?? []) {
      issues.push({
        statusName: issue.fields?.status?.name,
        sprintGoal: ((issue.fields?.[sprintGoalFieldId] as { value?: string } | null)?.value) ?? "",
      });
    }

    const next = (page.startAt ?? 0) + (page.maxResults ?? PAGE_SIZE);
    if (next >= (page.total ?? 0) || (page.issues ?? []).length === 0) break;
    startAt = next;
  }

  return issues;
}

export async function fetchSprintGoalsSummary(): Promise<SprintGoalsSummary> {
  const boards = await fetchAllBoards();

  const boardSprints = await runConcurrent(
    boards.map((board) => async () => {
      try {
        return { board, sprints: await fetchActiveSprintsForBoard(board.id) };
      } catch {
        return { board, sprints: [] as Sprint[] };
      }
    }),
    4
  );

  const activeSprints: Array<{ sprint: Sprint; projectKey: string; projectName: string }> = [];
  const seenIds = new Set<number>();
  for (const { board, sprints } of boardSprints) {
    for (const sprint of sprints) {
      if (seenIds.has(sprint.id)) continue;
      seenIds.add(sprint.id);
      activeSprints.push({ sprint, projectKey: board.projectKey, projectName: board.projectName });
    }
  }

  const issueGroups = await runConcurrent(
    activeSprints.map(({ sprint }) => () => fetchSprintIssuesMeta(sprint.id)),
    4
  );

  const projectMap = new Map<string, { projectName: string; achieved: number; total: number }>();
  for (let i = 0; i < activeSprints.length; i++) {
    const { projectKey, projectName } = activeSprints[i]!;
    const issues = issueGroups[i] ?? [];
    const withGoal = issues.filter((iss) => iss.sprintGoal);
    const achieved = withGoal.filter((iss) => isGoalAchieved(iss.statusName, iss.sprintGoal)).length;
    const existing = projectMap.get(projectKey);
    if (existing) {
      existing.achieved += achieved;
      existing.total += withGoal.length;
    } else {
      projectMap.set(projectKey, { projectName, achieved, total: withGoal.length });
    }
  }

  const byProject = [...projectMap.entries()]
    .map(([projectKey, { projectName, achieved, total }]) => ({ projectKey, projectName, achieved, total }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  return {
    achieved: byProject.reduce((s, p) => s + p.achieved, 0),
    total: byProject.reduce((s, p) => s + p.total, 0),
    byProject,
  };
}
