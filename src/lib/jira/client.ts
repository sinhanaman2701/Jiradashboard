import { unstable_cache } from "next/cache";
import type { JiraIssue, JiraUser, JiraWorklog } from "@/lib/jira/types";

const PAGE_SIZE = 50;

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

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Jira env var: ${name}`);
  }
  return value;
}

function getBaseUrl(): string {
  return getRequiredEnv("JIRA_BASE_URL").replace(/\/$/, "");
}

function getAuthHeader(): string {
  const email = getRequiredEnv("JIRA_EMAIL");
  const token = getRequiredEnv("JIRA_API_TOKEN");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Jira request failed: ${response.status} ${response.statusText} ${message}`);
  }

  return (await response.json()) as T;
}

export function isJiraConfigured(): boolean {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

export function getJiraBaseUrl(): string | undefined {
  return process.env.JIRA_BASE_URL?.replace(/\/$/, "");
}

export async function fetchAllUsers(): Promise<JiraUser[]> {
  const users: JiraUser[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<
      Array<{ accountId?: string; displayName?: string; active?: boolean; emailAddress?: string; accountType?: string }>
    >(`/rest/api/3/users?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    if (page.length === 0) break;

    for (const user of page) {
      if (user.accountType === "app") continue;
      if (!user.accountId || !user.displayName) continue;
      users.push({
        accountId: user.accountId,
        displayName: user.displayName,
        active: Boolean(user.active),
        emailAddress: user.emailAddress
      });
    }

    if (page.length < PAGE_SIZE) break;
    startAt += page.length;
  }

  return users;
}

export async function searchIssuesWithWorklogs(args: {
  from: string;
  to: string;
  projectKeys?: string[];
}): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  const etaFieldId = process.env.JIRA_ETA_FIELD_ID ?? "customfield_10071";
  const productClientFieldId = process.env.JIRA_PRODUCT_CLIENT_FIELD_ID ?? "customfield_10137";
  const projectClause =
    args.projectKeys && args.projectKeys.length
      ? `project in (${args.projectKeys.map((key) => `"${key}"`).join(", ")}) AND `
      : "";
  const jql = `${projectClause}worklogDate >= "${args.from}" AND worklogDate <= "${args.to}"`;
  let nextPageToken: string | undefined;

  while (true) {
    const page = await jiraFetch<{
      issues?: Array<{
        id: string;
        key: string;
        fields?: {
          summary?: string;
          project?: { key?: string; name?: string };
          status?: { name?: string };
          assignee?: { accountId?: string; displayName?: string };
          parent?: { key?: string; fields?: { summary?: string; issuetype?: { name?: string } } };
          customfield_10014?: string;
          [etaFieldId]?: string | null;
          [productClientFieldId]?: { value?: string } | null;
        };
      }>;
      isLast?: boolean;
      nextPageToken?: string;
    }>("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        fields: ["summary", "project", "status", "assignee", "parent", "customfield_10014", etaFieldId, productClientFieldId],
        maxResults: PAGE_SIZE,
        ...(nextPageToken ? { nextPageToken } : {})
      })
    });

    for (const issue of page.issues ?? []) {
      const parent = issue.fields?.parent;
      const isEpicParent = parent?.fields?.issuetype?.name === "Epic";
      const epicKey = isEpicParent
        ? parent?.key
        : (issue.fields?.customfield_10014 ?? undefined);
      const epicSummary = isEpicParent ? (parent?.fields?.summary ?? undefined) : undefined;

      issues.push({
        id: issue.id,
        key: issue.key,
        summary: issue.fields?.summary ?? issue.key,
        projectKey: issue.fields?.project?.key ?? "UNKNOWN",
        projectName: issue.fields?.project?.name,
        statusName: issue.fields?.status?.name,
        assigneeAccountId: issue.fields?.assignee?.accountId,
        assigneeDisplayName: issue.fields?.assignee?.displayName,
        epicKey,
        epicSummary,
        eta: (issue.fields?.[etaFieldId] as string | null | undefined) ?? undefined,
        productClient: (issue.fields?.[productClientFieldId] as { value?: string } | null | undefined)?.value ?? undefined,
      });
    }

    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }

  return issues;
}

export async function fetchIssueWorklogs(issue: JiraIssue): Promise<JiraWorklog[]> {
  const result: JiraWorklog[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      worklogs?: Array<{
        id: string | number;
        author?: { accountId?: string; displayName?: string };
        started?: string;
        timeSpentSeconds?: number;
      }>;
      total?: number;
      startAt?: number;
      maxResults?: number;
    }>(`/rest/api/3/issue/${issue.key}/worklog?startAt=${startAt}&maxResults=${PAGE_SIZE}`);

    for (const worklog of page.worklogs ?? []) {
      if (!worklog.author?.accountId || !worklog.author?.displayName || !worklog.started) continue;
      result.push({
        id: String(worklog.id),
        issueId: issue.id,
        issueKey: issue.key,
        issueSummary: issue.summary,
        projectKey: issue.projectKey,
        authorAccountId: worklog.author.accountId,
        authorDisplayName: worklog.author.displayName,
        started: worklog.started,
        timeSpentSeconds: worklog.timeSpentSeconds ?? 0
      });
    }

    const next = (page.startAt ?? 0) + (page.maxResults ?? PAGE_SIZE);
    if (next >= (page.total ?? 0) || (page.worklogs ?? []).length === 0) break;
    startAt = next;
  }

  return result;
}

export async function fetchAllIssueWorklogs(issues: JiraIssue[]): Promise<JiraWorklog[]> {
  const batches = await runConcurrent(
    issues.map((issue) => () => fetchIssueWorklogs(issue)),
    10
  );
  return batches.flat();
}

// Bulk worklog fetch — 2-3 API calls instead of one per issue
// Uses /worklog/updated (IDs since epoch) + /worklog/list (bulk detail fetch)
export async function fetchWorklogsForDateRange(
  from: string,
  to: string,
  issueById: Map<string, JiraIssue>,
  endTimestamp?: string
): Promise<JiraWorklog[]> {
  // Convert IST midnight of `from` date to epoch ms for the since parameter
  const sinceMs = new Date(`${from}T00:00:00.000+05:30`).getTime();
  const endBoundMs = endTimestamp
    ? new Date(endTimestamp).getTime()
    : new Date(`${to}T23:59:59.999+05:30`).getTime();

  // Step 1: Collect all worklog IDs updated since the start of `from`
  // We paginate until lastPage — the started-date filter in step 2 scopes results to the right week.
  // We must NOT stop at untilMs here: a worklog started in-range may have been edited later,
  // giving it an updatedTime after `to`. Stopping early would silently drop it.
  const worklogIds: number[] = [];
  let cursor = sinceMs;

  while (true) {
    const page = await jiraFetch<{
      values: Array<{ worklogId: number; updatedTime: number }>;
      since: number;
      until: number;
      lastPage: boolean;
    }>(`/rest/api/3/worklog/updated?since=${cursor}`);

    for (const entry of page.values) {
      worklogIds.push(entry.worklogId);
    }

    if (page.lastPage) break;
    cursor = page.until;
  }

  if (worklogIds.length === 0) return [];

  // Step 2: Bulk-fetch worklog details in batches of 1000
  const BATCH = 1000;
  const allWorklogs: JiraWorklog[] = [];

  for (let i = 0; i < worklogIds.length; i += BATCH) {
    const batchIds = worklogIds.slice(i, i + BATCH);
    const items = await jiraFetch<Array<{
      id: string | number;
      issueId: string;
      author?: { accountId?: string; displayName?: string };
      started?: string;
      timeSpentSeconds?: number;
    }>>("/rest/api/3/worklog/list", {
      method: "POST",
      body: JSON.stringify({ ids: batchIds }),
    });

    for (const worklog of items) {
      if (!worklog.author?.accountId || !worklog.author?.displayName || !worklog.started) continue;
      const startedDate = worklog.started.slice(0, 10);
      if (startedDate < from || startedDate > to) continue;
      if (new Date(worklog.started).getTime() > endBoundMs) continue;

      const issue = issueById.get(worklog.issueId);
      if (!issue) continue; // not in our project/date scope

      allWorklogs.push({
        id: String(worklog.id),
        issueId: worklog.issueId,
        issueKey: issue.key,
        issueSummary: issue.summary,
        projectKey: issue.projectKey,
        authorAccountId: worklog.author.accountId,
        authorDisplayName: worklog.author.displayName,
        started: worklog.started,
        timeSpentSeconds: worklog.timeSpentSeconds ?? 0,
      });
    }
  }

  return allWorklogs;
}

export const getCachedUsers = unstable_cache(
  fetchAllUsers,
  ["jira-users"],
  { revalidate: 300 }
);
